import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { homedir } from 'os';
import sharp from 'sharp';
import { ensureOutputDirectory, readImageDimensions, saveGeneratedImage } from './image-output.js';
import type {
  AspectRatio,
  ImageGenerationParams,
  ImageGenerationResult,
  ImageSize,
  XAIModel,
} from './types.js';

const XAI_GENERATIONS_URL = 'https://api.x.ai/v1/images/generations';
const XAI_EDITS_URL = 'https://api.x.ai/v1/images/edits';

const MAX_SOURCE_IMAGES = 3;

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

// The API rejects any aspect_ratio outside this set with a 422, so 4:5, 5:4 and
// 21:9 are generated at the closest supported shape and center-cropped after.
type XAIAspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '2:1';

const XAI_ASPECT_RATIOS: Record<AspectRatio, XAIAspectRatio> = {
  '1:1': '1:1',
  '2:3': '2:3',
  '3:2': '3:2',
  '3:4': '3:4',
  '4:3': '4:3',
  '4:5': '3:4',
  '5:4': '4:3',
  '9:16': '9:16',
  '16:9': '16:9',
  '21:9': '2:1',
};

// The API returns exact shapes, so this only absorbs rounding noise.
const ASPECT_RATIO_TOLERANCE = 0.01;

function targetRatioFor(aspectRatio: AspectRatio): number {
  const [width, height] = aspectRatio.split(':').map(Number);
  return width / height;
}

// Center-cropped rather than padded: Grok composes the subject centrally, and the
// crops needed here are small (6% for 4:5 and 5:4, 14% for 21:9).
async function conformToAspectRatio(
  imageBuffer: Buffer,
  targetRatio: number
): Promise<{ buffer: Buffer; width: number; height: number; cropped: boolean }> {
  const image = sharp(imageBuffer);
  const { width, height } = await image.metadata();

  if (!width || !height) {
    throw new Error('Could not read the dimensions of the image returned by xAI.');
  }

  const currentRatio = width / height;
  if (Math.abs(currentRatio - targetRatio) <= ASPECT_RATIO_TOLERANCE) {
    return { buffer: imageBuffer, width, height, cropped: false };
  }

  const cropWidth = currentRatio > targetRatio ? Math.round(height * targetRatio) : width;
  const cropHeight = currentRatio > targetRatio ? height : Math.round(width / targetRatio);

  const buffer = await image
    .extract({
      left: Math.round((width - cropWidth) / 2),
      top: Math.round((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();

  return { buffer, width: cropWidth, height: cropHeight, cropped: true };
}

interface GrokAuthEntry {
  key?: string;
  expires_at?: string;
}

function grokAuthPath(): string {
  return join(homedir(), '.grok', 'auth.json');
}

export function hasXAICredentials(): boolean {
  return Boolean(process.env.XAI_API_KEY) || existsSync(grokAuthPath());
}

// Grok CLI OIDC tokens expire (~6h) and are refreshed by the CLI itself,
// so the token is re-read from auth.json on every request rather than cached.
function resolveXAIToken(): string {
  const apiKey = process.env.XAI_API_KEY;
  if (apiKey) {
    return apiKey;
  }

  const authPath = grokAuthPath();
  if (!existsSync(authPath)) {
    throw new Error(
      'xAI credentials not found. Set XAI_API_KEY or log in with the Grok CLI (`grok`).'
    );
  }

  const auth = JSON.parse(readFileSync(authPath, 'utf-8')) as Record<string, GrokAuthEntry>;
  const entry = Object.values(auth).find((value) => value?.key);
  if (!entry?.key) {
    throw new Error(
      `No token found in ${authPath}. Log in with the Grok CLI (\`grok\`) or set XAI_API_KEY.`
    );
  }

  if (entry.expires_at && new Date(entry.expires_at).getTime() < Date.now()) {
    throw new Error(
      'Grok CLI token has expired. Open the Grok CLI (`grok`) to refresh it, or set XAI_API_KEY.'
    );
  }

  return entry.key;
}

export class XAIImageGenerator {
  private model: XAIModel;
  private outputDirectory: string;

  constructor(model: XAIModel, outputDirectory: string) {
    this.model = model;
    this.outputDirectory = outputDirectory;

    ensureOutputDirectory(this.outputDirectory);
  }

  private getResolutionForXAI(size: ImageSize): '1k' | '2k' {
    // The xAI API exposes a 1k/2k switch only — there is no 4k tier.
    switch (size) {
      case 'small':
        return '1k';
      case 'medium':
      case 'large':
      case 'xlarge':
        return '2k';
      default:
        throw new Error(`Unsupported image size for xAI: ${size}`);
    }
  }

  private buildPrompt(prompt: string, negativePrompt?: string): string {
    if (!negativePrompt) {
      return prompt;
    }

    return `${prompt}\nAvoid: ${negativePrompt}`;
  }

  /** Source images as `data:` URLs, in the order given. */
  private loadSourceImages(sourceImages?: string[]): string[] {
    if (!sourceImages || sourceImages.length === 0) {
      return [];
    }

    if (sourceImages.length > MAX_SOURCE_IMAGES) {
      throw new Error(
        `Too many source images: ${sourceImages.length}. xAI supports up to ${MAX_SOURCE_IMAGES} images.`
      );
    }

    return sourceImages.map((imagePath) => {
      if (!existsSync(imagePath)) {
        throw new Error(`Source image not found: ${imagePath}`);
      }

      const mimeType = SUPPORTED_EXTENSIONS[extname(imagePath).toLowerCase()];
      if (!mimeType) {
        throw new Error(
          `Unsupported source image format for xAI: ${imagePath}. Supported: ${Object.keys(SUPPORTED_EXTENSIONS).join(', ')}`
        );
      }

      const base64 = readFileSync(imagePath).toString('base64');
      return `data:${mimeType};base64,${base64}`;
    });
  }

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const {
      prompt,
      model: modelOverride,
      aspectRatio = '1:1',
      aspectRatioExplicit,
      imageSize = 'large',
      negativePrompt,
      sourceImages,
    } = params;
    const model = (modelOverride as XAIModel | undefined) ?? this.model;
    const finalPrompt = this.buildPrompt(prompt, negativePrompt);
    const images = this.loadSourceImages(sourceImages);

    // Edits default to the source image's shape. Forward a ratio only when the
    // caller asked for one, so an inherited default cannot silently reframe the
    // source. Note that the two tiers honour it differently: Imagine Image 2.0
    // reframes and outpaints to fill the new canvas, while the standard model
    // stretches the source to fit it.
    const shapesOutput = images.length === 0 || Boolean(aspectRatioExplicit);

    // Both generations and edits honour aspect_ratio and resolution.
    const body: Record<string, unknown> = {
      model,
      prompt: finalPrompt,
      n: 1,
      response_format: 'b64_json',
      resolution: this.getResolutionForXAI(imageSize),
    };

    if (shapesOutput) {
      body.aspect_ratio = XAI_ASPECT_RATIOS[aspectRatio];
    }

    if (images.length > 0) {
      // The edits endpoint types `image` as an object for a single source but as
      // bare data-URL strings for several; sending objects in the array is a 422.
      body.image = images.length === 1 ? { url: images[0], type: 'image_url' } : images;
    }

    const response = await fetch(images.length > 0 ? XAI_EDITS_URL : XAI_GENERATIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolveXAIToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`xAI API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as {
      data?: Array<{ b64_json?: string; mime_type?: string }>;
    };

    const imageBase64 = result.data?.[0]?.b64_json;
    if (!imageBase64) {
      throw new Error('No image data found in xAI response');
    }

    const rawBuffer = Buffer.from(imageBase64, 'base64');
    // Crop only when we asked for a shape; an edit that inherited the default
    // keeps whatever shape the source image produced.
    const conformed = shapesOutput
      ? await conformToAspectRatio(rawBuffer, targetRatioFor(aspectRatio))
      : undefined;
    const dimensions = conformed ?? readImageDimensions(rawBuffer);

    const filepath = saveGeneratedImage({
      outputDirectory: this.outputDirectory,
      prompt,
      imageBuffer: conformed?.buffer ?? rawBuffer,
      // Cropping re-encodes to PNG; otherwise the API's own format is kept.
      mimeType: conformed?.cropped ? 'image/png' : result.data?.[0]?.mime_type,
      metadata: {
        Software: 'mcp-image-gen',
        Source: 'xAI',
        Provider: 'xai',
        Description: prompt,
        Model: model,
        AspectRatio: aspectRatio,
        ImageSize: imageSize,
        ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
      },
    });

    return {
      provider: 'xai',
      imagePath: filepath,
      prompt,
      model,
      aspectRatio,
      imageSize,
      width: dimensions?.width,
      height: dimensions?.height,
    };
  }
}

import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { homedir } from 'os';
import { ensureOutputDirectory, readImageDimensions, saveGeneratedImage } from './image-output.js';
import type {
  ImageGenerationParams,
  ImageGenerationResult,
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

    const body: Record<string, unknown> = {
      model,
      prompt: finalPrompt,
      n: 1,
      response_format: 'b64_json',
    };

    if (images.length > 0) {
      // The edits endpoint types `image` as an object for a single source but as
      // bare data-URL strings for several; sending objects in the array is a 422.
      body.image =
        images.length === 1 ? { url: images[0], type: 'image_url' } : images;
      // Edits default to the source image's shape. Forward a ratio only when the
      // caller asked for one, so an inherited default cannot silently reframe the
      // source. Note that the two tiers honour it differently: Imagine Image 2.0
      // reframes and outpaints to fill the new canvas, while the standard model
      // stretches the source to fit it.
      if (aspectRatioExplicit) {
        body.aspect_ratio = aspectRatio;
      }
    } else {
      body.aspect_ratio = aspectRatio;
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

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const dimensions = readImageDimensions(imageBuffer);

    const filepath = saveGeneratedImage({
      outputDirectory: this.outputDirectory,
      prompt,
      imageBuffer,
      mimeType: result.data?.[0]?.mime_type,
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

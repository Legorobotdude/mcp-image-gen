import OpenAI from 'openai';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import { ensureOutputDirectory, readImageDimensions, savePngWithMetadata } from './image-output.js';
import {
  isGptImage25Model,
  type AspectRatio,
  type ImageGenerationParams,
  type ImageGenerationResult,
  type ImageSize,
  type OpenAIBackground,
  type OpenAIModel,
  type OpenAIQuality,
} from './types.js';

const MAX_SOURCE_IMAGES = 16;

const GPT_IMAGE_25_MAX_EDGE = 3840;
const GPT_IMAGE_25_MAX_PIXELS = 8_294_400;
const GPT_IMAGE_25_MIN_PIXELS = 655_360;

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const ASPECT_RATIO_PHRASES: Record<AspectRatio, string> = {
  '1:1': 'square, 1:1 aspect ratio',
  '2:3': 'portrait orientation, 2:3 aspect ratio',
  '3:2': 'landscape orientation, 3:2 aspect ratio',
  '3:4': 'portrait orientation, 3:4 aspect ratio',
  '4:3': 'landscape orientation, 4:3 aspect ratio',
  '4:5': 'portrait orientation, 4:5 aspect ratio',
  '5:4': 'landscape orientation, 5:4 aspect ratio',
  '9:16': 'tall portrait orientation, 9:16 vertical aspect ratio',
  '16:9': 'wide landscape orientation, 16:9 aspect ratio',
  '21:9': 'ultrawide landscape orientation, 21:9 aspect ratio',
};

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

export class OpenAIImageGenerator {
  private client: OpenAI;
  private model: OpenAIModel;
  private outputDirectory: string;

  constructor(apiKey: string, model: OpenAIModel, outputDirectory: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.outputDirectory = outputDirectory;

    ensureOutputDirectory(this.outputDirectory);
  }

  // Pre-2.5 GPT Image models only accept these fixed sizes.
  private getLegacySizeForAspectRatio(
    aspectRatio: AspectRatio
  ): '1024x1024' | '1536x1024' | '1024x1536' {
    switch (aspectRatio) {
      case '2:3':
      case '3:4':
      case '4:5':
      case '9:16':
        return '1024x1536';
      case '3:2':
      case '4:3':
      case '5:4':
      case '16:9':
      case '21:9':
        return '1536x1024';
      case '1:1':
        return '1024x1024';
    }
  }

  private getLongEdgeForImageSize(size: ImageSize): number {
    switch (size) {
      case 'small':
        return 1024;
      case 'medium':
      case 'large':
        return 2048;
      case 'xlarge':
        return GPT_IMAGE_25_MAX_EDGE;
    }
  }

  // GPT Image 2.5 accepts custom WxH within documented edge/pixel constraints.
  private getGptImage25Size(aspectRatio: AspectRatio, imageSize: ImageSize): string {
    const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
    let longEdge = this.getLongEdgeForImageSize(imageSize);

    const dimensionsForLongEdge = (edge: number): { width: number; height: number } => {
      let width: number;
      let height: number;
      if (ratioW >= ratioH) {
        width = edge;
        height = roundToMultiple((edge * ratioH) / ratioW, 16);
      } else {
        height = edge;
        width = roundToMultiple((edge * ratioW) / ratioH, 16);
      }

      width = Math.min(width, GPT_IMAGE_25_MAX_EDGE);
      height = Math.min(height, GPT_IMAGE_25_MAX_EDGE);

      let pixels = width * height;
      if (pixels > GPT_IMAGE_25_MAX_PIXELS) {
        const scale = Math.sqrt(GPT_IMAGE_25_MAX_PIXELS / pixels);
        width = roundToMultiple(width * scale, 16);
        height = roundToMultiple(height * scale, 16);
        while (width * height > GPT_IMAGE_25_MAX_PIXELS) {
          if (width >= height) {
            width = Math.max(16, width - 16);
          } else {
            height = Math.max(16, height - 16);
          }
        }
      }

      return { width, height };
    };

    let { width, height } = dimensionsForLongEdge(longEdge);
    while (width * height < GPT_IMAGE_25_MIN_PIXELS && longEdge < GPT_IMAGE_25_MAX_EDGE) {
      longEdge = Math.min(GPT_IMAGE_25_MAX_EDGE, longEdge + 16);
      ({ width, height } = dimensionsForLongEdge(longEdge));
    }

    return `${width}x${height}`;
  }

  private getSize(model: OpenAIModel, aspectRatio: AspectRatio, imageSize: ImageSize): string {
    if (isGptImage25Model(model)) {
      return this.getGptImage25Size(aspectRatio, imageSize);
    }
    return this.getLegacySizeForAspectRatio(aspectRatio);
  }

  // Pre-2.5: imageSize cannot change pixel dimensions (capped at 1536px), so it
  // maps to rendering quality. GPT Image 2.5 uses imageSize for resolution
  // instead; auto quality defaults to high.
  private getQualityForImageSize(model: OpenAIModel, size: ImageSize): OpenAIQuality {
    if (isGptImage25Model(model)) {
      return 'high';
    }

    switch (size) {
      case 'small':
        return 'low';
      case 'medium':
        return 'medium';
      case 'large':
      case 'xlarge':
        return 'high';
    }
  }

  private assertQualitySupported(model: OpenAIModel, quality: OpenAIQuality): void {
    if ((quality === 'xhigh' || quality === 'max') && !isGptImage25Model(model)) {
      throw new Error(
        `Quality "${quality}" is only supported on gpt-image-2.5-flare and gpt-image-2.5-sunburst.`
      );
    }
  }

  // A non-openai.com base URL means a proxy (e.g. the local Codex proxy) that
  // forwards requests to a chat model driving the image_generation tool. Such
  // backends ignore the API-level size/quality config but honor instructions
  // embedded in the prompt text.
  private isProxiedBackend(): boolean {
    return !(this.client.baseURL ?? '').startsWith('https://api.openai.com');
  }

  private buildPrompt(
    prompt: string,
    negativePrompt: string | undefined,
    aspectRatio: AspectRatio
  ): string {
    let finalPrompt = prompt;
    if (negativePrompt) {
      finalPrompt += `\nAvoid: ${negativePrompt}`;
    }
    if (this.isProxiedBackend()) {
      finalPrompt += `\n\nRender the image in ${ASPECT_RATIO_PHRASES[aspectRatio]}, at the highest available resolution and quality.`;
    }
    return finalPrompt;
  }

  private validateSourceImages(sourceImages?: string[]): string[] {
    if (!sourceImages || sourceImages.length === 0) {
      return [];
    }

    if (sourceImages.length > MAX_SOURCE_IMAGES) {
      throw new Error(
        `Too many source images: ${sourceImages.length}. OpenAI supports up to ${MAX_SOURCE_IMAGES} images.`
      );
    }

    for (const imagePath of sourceImages) {
      if (!existsSync(imagePath)) {
        throw new Error(`Source image not found: ${imagePath}`);
      }

      const extension = extname(imagePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw new Error(
          `Unsupported source image format "${extension}" for OpenAI: ${imagePath}. Supported: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}`
        );
      }
    }

    return sourceImages;
  }

  // The Codex proxy has no /v1/images/edits endpoint, but its /v1/responses
  // route forwards input_image parts to the chat model driving the
  // image_generation tool, which uses them as references. `model` is omitted
  // so the proxy substitutes its configured default chat model; `action` is
  // required by the ChatGPT Codex backend's image_generation tool variant.
  private async editViaProxiedResponses(
    finalPrompt: string,
    sourceImages: string[],
    size: string,
    quality: OpenAIQuality,
    background: OpenAIBackground
  ): Promise<string> {
    const content = [
      { type: 'input_text', text: finalPrompt },
      ...sourceImages.map((imagePath) => ({
        type: 'input_image',
        image_url: `data:${MIME_TYPES[extname(imagePath).toLowerCase()]};base64,${readFileSync(imagePath).toString('base64')}`,
        detail: 'auto',
      })),
    ];

    const response = await this.client.responses.create({
      instructions: 'Use the image_generation tool to generate the requested image.',
      input: [{ role: 'user', content }],
      tools: [
        { type: 'image_generation', action: 'generate', output_format: 'png', size, quality, background },
      ],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      store: false,
    } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming);

    for (const item of response.output ?? []) {
      if (item.type === 'image_generation_call' && typeof item.result === 'string' && item.result) {
        return item.result;
      }
    }

    const modelText = response.output_text?.trim();
    throw new Error(
      `Codex backend did not return an image${modelText ? `. Model response: ${modelText}` : '.'}`
    );
  }

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const {
      prompt,
      model: modelOverride,
      aspectRatio = '1:1',
      imageSize = 'large',
      negativePrompt,
      sourceImages,
      background = 'auto',
      quality = 'auto',
      moderation = 'auto',
    } = params;
    const model = (modelOverride as OpenAIModel | undefined) ?? this.model;
    this.assertQualitySupported(model, quality);
    const size = this.getSize(model, aspectRatio, imageSize);
    const effectiveQuality =
      quality === 'auto' ? this.getQualityForImageSize(model, imageSize) : quality;
    const finalPrompt = this.buildPrompt(prompt, negativePrompt, aspectRatio);
    const validatedSourceImages = this.validateSourceImages(sourceImages);

    // SDK types lag GPT Image 2.5 (custom WxH sizes; xhigh/max quality).
    const apiSize = size as '1024x1024';
    const apiQuality = effectiveQuality as 'high';

    let imageBase64: string | undefined;
    if (validatedSourceImages.length > 0 && this.isProxiedBackend()) {
      imageBase64 = await this.editViaProxiedResponses(
        finalPrompt,
        validatedSourceImages,
        size,
        effectiveQuality,
        background
      );
    } else {
      const response =
        validatedSourceImages.length > 0
          ? await this.client.images.edit({
              model,
              image: validatedSourceImages.map((imagePath) => createReadStream(imagePath)),
              prompt: finalPrompt,
              n: 1,
              size: apiSize,
              quality: apiQuality,
              background,
              output_format: 'png',
            })
          : await this.client.images.generate({
              model,
              prompt: finalPrompt,
              n: 1,
              size: apiSize,
              quality: apiQuality,
              background,
              moderation,
              output_format: 'png',
            });
      imageBase64 = response.data?.[0]?.b64_json;
    }

    if (!imageBase64) {
      throw new Error('No image data found in OpenAI response');
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const dimensions = readImageDimensions(imageBuffer);

    const filepath = savePngWithMetadata({
      outputDirectory: this.outputDirectory,
      prompt,
      imageBuffer,
      metadata: {
        Software: 'mcp-image-gen',
        Source: 'OpenAI',
        Provider: 'openai',
        Description: prompt,
        Model: model,
        AspectRatio: aspectRatio,
        ImageSize: imageSize,
        RequestedSize: size,
        Background: background,
        Quality: effectiveQuality,
        ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
        ...(validatedSourceImages.length === 0 ? { Moderation: moderation } : {}),
      },
    });

    return {
      provider: 'openai',
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

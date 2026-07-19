import OpenAI from 'openai';
import { createReadStream, existsSync } from 'fs';
import { extname } from 'path';
import { ensureOutputDirectory, savePngWithMetadata } from './image-output.js';
import type {
  AspectRatio,
  ImageGenerationParams,
  ImageGenerationResult,
  ImageSize,
  OpenAIBackground,
  OpenAIModel,
  OpenAIQuality,
  OpenAIModeration,
} from './types.js';

const MAX_SOURCE_IMAGES = 16;

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

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

  private getSizeForAspectRatio(aspectRatio: AspectRatio): '1024x1024' | '1536x1024' | '1024x1536' {
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

  private buildPrompt(prompt: string, negativePrompt?: string): string {
    if (!negativePrompt) {
      return prompt;
    }

    return `${prompt}\nAvoid: ${negativePrompt}`;
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
    const size = this.getSizeForAspectRatio(aspectRatio);
    const finalPrompt = this.buildPrompt(prompt, negativePrompt);
    const validatedSourceImages = this.validateSourceImages(sourceImages);

    const response =
      validatedSourceImages.length > 0
        ? await this.client.images.edit({
            model,
            image: validatedSourceImages.map((imagePath) => createReadStream(imagePath)),
            prompt: finalPrompt,
            n: 1,
            size,
            quality,
            background,
            output_format: 'png',
          })
        : await this.client.images.generate({
            model,
            prompt: finalPrompt,
            n: 1,
            size,
            quality,
            background,
            moderation,
            output_format: 'png',
          });

    const imageBase64 = response.data?.[0]?.b64_json;
    if (!imageBase64) {
      throw new Error('No image data found in OpenAI response');
    }

    const filepath = savePngWithMetadata({
      outputDirectory: this.outputDirectory,
      prompt,
      imageBuffer: Buffer.from(imageBase64, 'base64'),
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
        Quality: quality,
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
    };
  }
}

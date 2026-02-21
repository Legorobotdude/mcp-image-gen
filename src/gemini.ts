import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import type { ImageGenerationParams, GeminiModel, AspectRatio, ImageSize } from './types.js';

const MAX_SOURCE_IMAGES = 14;

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

interface GenerationResult {
  imagePath: string;
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}

export class GeminiImageGenerator {
  private client: GoogleGenAI;
  private model: GeminiModel;
  private outputDirectory: string;

  constructor(apiKey: string, model: GeminiModel, outputDirectory: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
    this.outputDirectory = outputDirectory;

    // Ensure output directory exists
    if (!existsSync(this.outputDirectory)) {
      mkdirSync(this.outputDirectory, { recursive: true });
    }
  }

  private getImageSizeForGemini(size: ImageSize): '1K' | '2K' | '4K' {
    // Gemini API requires "1K", "2K", or "4K" (uppercase K)
    switch (size) {
      case 'small':
        return '1K';
      case 'medium':
      case 'large':
        return '2K';
      case 'xlarge':
        return '4K';
    }
  }

  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const mimeType = SUPPORTED_MIME_TYPES[ext];
    if (!mimeType) {
      throw new Error(
        `Unsupported image format "${ext}" for file: ${filePath}. Supported: ${Object.keys(SUPPORTED_MIME_TYPES).join(', ')}`
      );
    }
    return mimeType;
  }

  private buildContentParts(
    contentText: string,
    sourceImages?: string[]
  ): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    // Add text prompt
    parts.push({ text: contentText });

    // Add source images if provided
    if (sourceImages && sourceImages.length > 0) {
      if (sourceImages.length > MAX_SOURCE_IMAGES) {
        throw new Error(
          `Too many source images: ${sourceImages.length}. Maximum is ${MAX_SOURCE_IMAGES}.`
        );
      }

      for (const imagePath of sourceImages) {
        if (!existsSync(imagePath)) {
          throw new Error(`Source image not found: ${imagePath}`);
        }

        const mimeType = this.getMimeType(imagePath);
        const imageData = readFileSync(imagePath);
        const base64Data = imageData.toString('base64');

        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
    }

    return parts;
  }

  async generateImage(params: ImageGenerationParams): Promise<GenerationResult> {
    const {
      prompt,
      aspectRatio = '1:1',
      imageSize = 'large',
      negativePrompt,
      sourceImages
    } = params;

    // Build contents
    let contentText = prompt;
    if (negativePrompt) {
      contentText += `\nNegative prompt: ${negativePrompt}`;
    }

    // Build content parts (text + optional source images)
    const hasSourceImages = sourceImages && sourceImages.length > 0;
    const contents = hasSourceImages
      ? this.buildContentParts(contentText, sourceImages)
      : contentText;

    // Use the new @google/genai SDK API
    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio,
          imageSize: this.getImageSizeForGemini(imageSize),
        },
      },
    });

    // Extract image from response
    const candidates = response.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          const buffer = Buffer.from(part.inlineData.data as string, 'base64');
          const timestamp = Date.now();
          const sanitizedPrompt = prompt
            .substring(0, 50)
            .replace(/[^a-zA-Z0-9]/g, '_');
          const filename = `${timestamp}_${sanitizedPrompt}.png`;
          const filepath = join(this.outputDirectory, filename);

          writeFileSync(filepath, buffer);

          return {
            imagePath: filepath,
            prompt,
            model: this.model,
            aspectRatio,
            imageSize,
          };
        }
      }
    }

    throw new Error('No image data found in response');
  }
}

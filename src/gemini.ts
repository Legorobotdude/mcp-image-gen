import { GoogleGenAI } from '@google/genai';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { ImageGenerationParams, GeminiModel, AspectRatio, ImageSize } from './types.js';

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

  async generateImage(params: ImageGenerationParams): Promise<GenerationResult> {
    const {
      prompt,
      aspectRatio = '1:1',
      imageSize = 'large',
      negativePrompt
    } = params;

    // Build contents
    let contentText = prompt;
    if (negativePrompt) {
      contentText += `\nNegative prompt: ${negativePrompt}`;
    }

    // Use the new @google/genai SDK API
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: contentText,
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

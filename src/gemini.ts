import { GoogleGenerativeAI } from '@google/generative-ai';
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
  private client: GoogleGenerativeAI;
  private model: GeminiModel;
  private outputDirectory: string;

  constructor(apiKey: string, model: GeminiModel, outputDirectory: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.outputDirectory = outputDirectory;

    // Ensure output directory exists
    if (!existsSync(this.outputDirectory)) {
      mkdirSync(this.outputDirectory, { recursive: true });
    }
  }

  private getImageSizeForGemini(size: ImageSize): string {
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

    const model = this.client.getGenerativeModel({ model: this.model });

    // Build the generation config
    const config: any = {
      responseModalities: ['IMAGE'],
    };

    // Only Gemini 3 Pro supports detailed image configuration
    if (this.model === 'gemini-3-pro-image-preview') {
      config.imageConfig = {
        aspectRatio,
        imageSize: this.getImageSizeForGemini(imageSize),
      };
    }

    // Build contents
    let contentText = prompt;
    if (negativePrompt) {
      contentText += `\nNegative prompt: ${negativePrompt}`;
    }

    const result = await model.generateContent(contentText, config);

    const response = result.response;

    // Extract image from response
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
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

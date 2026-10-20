import { GoogleGenAI, type SafetySetting } from '@google/genai';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { ensureOutputDirectory, readImageDimensions, savePngWithMetadata } from './image-output.js';
import type { ImageGenerationParams, ImageGenerationResult, GeminiModel, ImageSize } from './types.js';

const MAX_SOURCE_IMAGES = 14;

// The four adjustable harm filters. Without these the API applies its defaults, which silently
// drop swimwear and firearm images that the non-adjustable policy filters would allow.
const SAFETY_SETTINGS = [
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
].map((category) => ({ category, threshold: 'BLOCK_NONE' })) as SafetySetting[];

interface ResponseWithoutImage {
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  candidates?: Array<{ finishReason?: string; finishMessage?: string; content?: { parts?: Array<{ text?: string }> } }>;
}

/** Explains why a Gemini response carried no image (block reason, finish reason, model text). */
export function describeMissingImage(response: ResponseWithoutImage): string {
  const details: string[] = [];
  const feedback = response.promptFeedback;
  if (feedback?.blockReason) {
    details.push(`prompt blocked: ${feedback.blockReason}${feedback.blockReasonMessage ? ` (${feedback.blockReasonMessage})` : ''}`);
  }
  const candidate = response.candidates?.[0];
  if (!candidate && !feedback?.blockReason) details.push('no candidates returned');
  if (candidate?.finishReason) details.push(`finishReason: ${candidate.finishReason}`);
  if (candidate?.finishMessage) details.push(`finishMessage: ${candidate.finishMessage}`);
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join(' ').trim();
  if (text) details.push(`model text: ${text.slice(0, 500)}`);
  return `No image data found in response${details.length ? ` (${details.join('; ')})` : ''}`;
}

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export class GeminiImageGenerator {
  private client: GoogleGenAI;
  private model: GeminiModel;
  private outputDirectory: string;

  constructor(apiKey: string, model: GeminiModel, outputDirectory: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
    this.outputDirectory = outputDirectory;

    ensureOutputDirectory(this.outputDirectory);
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
      default:
        throw new Error(`Unsupported image size for Gemini: ${size}`);
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

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const {
      prompt,
      model: modelOverride,
      aspectRatio = '1:1',
      imageSize = 'large',
      negativePrompt,
      sourceImages
    } = params;
    const model = modelOverride ?? this.model;

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
      model,
      contents,
      config: {
        // TEXT lets the model explain a refusal instead of returning an empty image part.
        responseModalities: ['TEXT', 'IMAGE'],
        safetySettings: SAFETY_SETTINGS,
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
          const rawBuffer = Buffer.from(part.inlineData.data as string, 'base64');
          const filepath = savePngWithMetadata({
            outputDirectory: this.outputDirectory,
            prompt,
            imageBuffer: rawBuffer,
            metadata: {
              Software: 'mcp-image-gen',
              Source: 'Google Gemini AI',
              Provider: 'gemini',
              Description: prompt,
              Model: model,
              AspectRatio: aspectRatio,
              ImageSize: imageSize,
              ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
            },
          });

          const dimensions = readImageDimensions(rawBuffer);

          return {
            provider: 'gemini',
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
    }

    throw new Error(describeMissingImage(response));
  }
}

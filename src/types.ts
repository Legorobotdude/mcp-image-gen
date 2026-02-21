export type GeminiModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

export type ImageSize = 'small' | 'medium' | 'large' | 'xlarge';

export interface ServerConfig {
  model?: GeminiModel;
  defaultAspectRatio?: AspectRatio;
  defaultImageSize?: ImageSize;
  outputDirectory?: string;
}

export interface ImageGenerationParams {
  prompt: string;
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  negativePrompt?: string;
  sourceImages?: string[];
}

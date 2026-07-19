export type GeminiModel =
  | 'gemini-2.5-flash-image'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview';

export type OpenAIModel =
  | 'gpt-image-2'
  | 'gpt-image-1.5'
  | 'chatgpt-image-latest'
  | 'gpt-image-1'
  | 'gpt-image-1-mini';

export type Provider = 'gemini' | 'openai';

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

export type ImageSize = 'small' | 'medium' | 'large' | 'xlarge';

export type OpenAIBackground = 'auto' | 'transparent' | 'opaque';

export type OpenAIQuality = 'auto' | 'low' | 'medium' | 'high';

export type OpenAIModeration = 'auto' | 'low';

export type ImageModel = GeminiModel | OpenAIModel;

export const PROVIDERS: Provider[] = ['gemini', 'openai'];

export const GEMINI_MODELS: GeminiModel[] = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
];

export const OPENAI_MODELS: OpenAIModel[] = [
  'gpt-image-2',
  'gpt-image-1.5',
  'chatgpt-image-latest',
  'gpt-image-1',
  'gpt-image-1-mini',
];

export const ALL_MODELS: ImageModel[] = [...GEMINI_MODELS, ...OPENAI_MODELS];

export function isGeminiModel(model: string): model is GeminiModel {
  return GEMINI_MODELS.includes(model as GeminiModel);
}

export function isOpenAIModel(model: string): model is OpenAIModel {
  return OPENAI_MODELS.includes(model as OpenAIModel);
}

export function getProviderForModel(model: ImageModel): Provider {
  return isGeminiModel(model) ? 'gemini' : 'openai';
}

export function providerSupportsModel(provider: Provider, model: ImageModel): boolean {
  return provider === getProviderForModel(model);
}

export interface ServerConfig {
  model?: ImageModel;
  defaultAspectRatio?: AspectRatio;
  defaultImageSize?: ImageSize;
  outputDirectory?: string;
}

export interface ImageGenerationParams {
  prompt: string;
  model?: ImageModel;
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  negativePrompt?: string;
  sourceImages?: string[];
  background?: OpenAIBackground;
  quality?: OpenAIQuality;
  moderation?: OpenAIModeration;
}

export interface ImageGenerationResult {
  provider: Provider;
  imagePath: string;
  prompt: string;
  model: ImageModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}

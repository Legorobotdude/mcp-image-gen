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

export type XAIModel = 'grok-imagine-image' | 'grok-imagine-image-quality';

export type Provider = 'gemini' | 'openai' | 'xai';

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

export type ImageSize = 'small' | 'medium' | 'large' | 'xlarge';

export type OpenAIBackground = 'auto' | 'transparent' | 'opaque';

export type OpenAIQuality = 'auto' | 'low' | 'medium' | 'high';

export type OpenAIModeration = 'auto' | 'low';

export type ImageModel = GeminiModel | OpenAIModel | XAIModel;

export const PROVIDERS: Provider[] = ['gemini', 'openai', 'xai'];

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

export const XAI_MODELS: XAIModel[] = ['grok-imagine-image', 'grok-imagine-image-quality'];

export const ALL_MODELS: ImageModel[] = [...GEMINI_MODELS, ...OPENAI_MODELS, ...XAI_MODELS];

export function isGeminiModel(model: string): model is GeminiModel {
  return GEMINI_MODELS.includes(model as GeminiModel);
}

export function isOpenAIModel(model: string): model is OpenAIModel {
  return OPENAI_MODELS.includes(model as OpenAIModel);
}

export function isXAIModel(model: string): model is XAIModel {
  return XAI_MODELS.includes(model as XAIModel);
}

export function getProviderForModel(model: ImageModel): Provider {
  if (isGeminiModel(model)) return 'gemini';
  if (isOpenAIModel(model)) return 'openai';
  return 'xai';
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
  /**
   * True when the caller passed aspectRatio explicitly rather than inheriting
   * the config default. Edit calls only forward a ratio when it was asked for,
   * so an unrequested default cannot silently reframe the source image.
   */
  aspectRatioExplicit?: boolean;
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
  // Actual pixel dimensions of the saved image, when determinable (PNG output).
  width?: number;
  height?: number;
}

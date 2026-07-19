#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GeminiImageGenerator } from './gemini.js';
import { OpenAIImageGenerator } from './openai.js';
import { hasXAICredentials, XAIImageGenerator } from './xai.js';
import { loadConfig } from './config.js';
import {
  ALL_MODELS,
  getProviderForModel,
  isGeminiModel,
  isOpenAIModel,
  isXAIModel,
  OPENAI_MODELS,
  XAI_MODELS,
  type AspectRatio,
  type ImageGenerationParams,
  type ImageModel,
  type ImageSize,
  type OpenAIBackground,
  type OpenAIQuality,
  type OpenAIModeration,
  type Provider,
} from './types.js';

function getFallbackConfig(config: ReturnType<typeof loadConfig>): ReturnType<typeof loadConfig> {
  const available: Record<Provider, boolean> = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    xai: hasXAICredentials(),
  };

  if (!available.gemini && !available.openai && !available.xai) {
    console.error(
      'Error: set GEMINI_API_KEY, OPENAI_API_KEY, or XAI_API_KEY (or log in with the Grok CLI). At least one provider is required.'
    );
    process.exit(1);
  }

  if (!available[getProviderForModel(config.model)]) {
    return {
      ...config,
      model: available.gemini
        ? 'gemini-3-pro-image-preview'
        : available.openai
          ? 'gpt-image-1.5'
          : 'grok-imagine-image',
    };
  }

  return config;
}

const config = getFallbackConfig(loadConfig());

const geminiApiKey = process.env.GEMINI_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

const geminiGenerator = geminiApiKey
  ? new GeminiImageGenerator(geminiApiKey, 'gemini-3-pro-image-preview', config.outputDirectory)
  : null;

const openaiGenerator = openaiApiKey
  ? new OpenAIImageGenerator(openaiApiKey, OPENAI_MODELS[0], config.outputDirectory)
  : null;

const xaiGenerator = hasXAICredentials()
  ? new XAIImageGenerator(XAI_MODELS[0], config.outputDirectory)
  : null;

function resolveProviderAndModel(args: Record<string, unknown>): {
  provider: Provider;
  model: ImageModel;
} {
  const requestedModel = typeof args.model === 'string' ? args.model : config.model;

  if (!ALL_MODELS.includes(requestedModel as ImageModel)) {
    throw new Error(`Unsupported model: ${requestedModel}`);
  }

  const provider = getProviderForModel(requestedModel as ImageModel);
  const model = requestedModel as ImageModel;

  return { provider, model };
}

function buildToolDescription(): string {
  return `Generate an image using Google Gemini, OpenAI, or xAI Grok image models. Provider is inferred from the selected model. Default model: ${config.model}. Images are saved to ${config.outputDirectory}.`;
}

if (getProviderForModel(config.model) === 'gemini' && !geminiGenerator) {
  console.error('Default config targets Gemini but GEMINI_API_KEY is not set.');
}

if (getProviderForModel(config.model) === 'openai' && !openaiGenerator) {
  console.error('Default config targets OpenAI but OPENAI_API_KEY is not set.');
  process.exit(1);
}

// Create MCP server
const server = new Server(
  {
    name: 'mcp-image-gen',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'generate_image',
        description: buildToolDescription(),
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Text description of the image to generate. Be detailed and specific for best results.',
            },
            model: {
              type: 'string',
              enum: ALL_MODELS,
              description: `Image model to use. Default: ${config.model}`,
            },
            aspectRatio: {
              type: 'string',
              enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
              description: `Aspect ratio of the generated image. Default: ${config.defaultAspectRatio}`,
              default: config.defaultAspectRatio,
            },
            imageSize: {
              type: 'string',
              enum: ['small', 'medium', 'large', 'xlarge'],
              description: `Image resolution (small: 1K, medium: 2K, large: 2K, xlarge: 4K). Note: gemini-2.5-flash-image only supports 1K. Default: ${config.defaultImageSize}`,
              default: config.defaultImageSize,
            },
            negativePrompt: {
              type: 'string',
              description: 'Optional. Describe what you do NOT want in the image.',
            },
            sourceImages: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional. Array of absolute file paths to source/reference images for image editing, style transfer, or character consistency. Gemini supports png, jpg, jpeg, gif, webp (max 14). OpenAI supports png, jpg, jpeg, webp (max 16). xAI Grok supports png, jpg, jpeg, webp (max 3).',
            },
          },
          required: ['prompt'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'generate_image') {
    try {
      const args = request.params.arguments || {};

      if (!args || typeof args !== 'object' || !('prompt' in args) || typeof args.prompt !== 'string') {
        throw new Error('Invalid arguments: prompt is required and must be a string');
      }

      const { provider, model } = resolveProviderAndModel(args as Record<string, unknown>);

      // Apply defaults from config
      const finalParams: ImageGenerationParams = {
        prompt: args.prompt,
        model,
        aspectRatio: (args.aspectRatio as AspectRatio) || config.defaultAspectRatio,
        imageSize: (args.imageSize as ImageSize) || config.defaultImageSize,
        negativePrompt: args.negativePrompt as string | undefined,
        sourceImages: args.sourceImages as string[] | undefined,
        quality: (args.quality as OpenAIQuality) || 'auto',
        background: (args.background as OpenAIBackground) || 'auto',
        moderation: 'low',
      };

      const result = await (() => {
        if (provider === 'gemini') {
          if (!geminiGenerator || !isGeminiModel(model)) {
            throw new Error('GEMINI_API_KEY is required to use Gemini image generation models.');
          }
          return geminiGenerator.generateImage(finalParams);
        }

        if (provider === 'xai') {
          if (!xaiGenerator || !isXAIModel(model)) {
            throw new Error(
              'XAI_API_KEY or a Grok CLI login is required to use Grok image generation models.'
            );
          }
          return xaiGenerator.generateImage(finalParams);
        }

        if (!openaiGenerator || !isOpenAIModel(model)) {
          throw new Error('OPENAI_API_KEY is required to use OpenAI image generation models.');
        }
        return openaiGenerator.generateImage(finalParams);
      })();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                provider: result.provider,
                imagePath: result.imagePath,
                prompt: result.prompt,
                model: result.model,
                aspectRatio: result.aspectRatio,
                imageSize: result.imageSize,
                message: `Image generated successfully and saved to: ${result.imagePath}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Image Gen Server running on stdio');
  console.error(`Default Model: ${config.model}`);
  console.error(`Output Directory: ${config.outputDirectory}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

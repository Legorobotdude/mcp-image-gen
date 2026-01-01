#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GeminiImageGenerator } from './gemini.js';
import { loadConfig } from './config.js';
import type { ImageGenerationParams, AspectRatio, ImageSize } from './types.js';

const config = loadConfig();

// Validate API key
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize Gemini client
const generator = new GeminiImageGenerator(
  apiKey,
  config.model,
  config.outputDirectory
);

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
        description: `Generate an image using Google Gemini AI (${config.model}). Creates high-quality images from text prompts with customizable aspect ratios and sizes. Images are saved to ${config.outputDirectory}.`,
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Text description of the image to generate. Be detailed and specific for best results.',
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

      // Apply defaults from config
      const finalParams: ImageGenerationParams = {
        prompt: args.prompt,
        aspectRatio: (args.aspectRatio as AspectRatio) || config.defaultAspectRatio,
        imageSize: (args.imageSize as ImageSize) || config.defaultImageSize,
        negativePrompt: args.negativePrompt as string | undefined,
      };

      const result = await generator.generateImage(finalParams);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
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
  console.error(`Model: ${config.model}`);
  console.error(`Output Directory: ${config.outputDirectory}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

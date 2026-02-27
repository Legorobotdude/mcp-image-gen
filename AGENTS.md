# CLAUDE.md

## Project Overview

MCP Image Generation server using Google Gemini API.

## Important: Google Gemini SDK

**Use `@google/genai` NOT `@google/generative-ai`.**

The old SDK (`@google/generative-ai`) does NOT support image generation config (`imageConfig`, `responseModalities`). It has a completely different API signature and silently ignores these parameters.

Correct usage with `@google/genai`:
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model: 'gemini-3-pro-image-preview',
  contents: prompt,
  config: {
    responseModalities: ['IMAGE'],
    imageConfig: {
      aspectRatio: '16:9',  // "1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"
      imageSize: '2K',      // "1K", "2K", "4K" (uppercase K required)
    },
  },
});
```

## Commands

- `pnpm build` - Compile TypeScript
- `pnpm dev` - Run in development mode

## Image Size Mapping

| Parameter | Gemini API | Resolution |
|-----------|------------|------------|
| small     | 1K         | ~1024px    |
| medium    | 2K         | ~2048px    |
| large     | 2K         | ~2048px    |
| xlarge    | 4K         | ~4096px    |

## Environment Variables

- `GEMINI_API_KEY` - Required. Google Gemini API key.

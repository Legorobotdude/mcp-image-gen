# MCP Image Gen

A Model Context Protocol (MCP) server for generating images using Google's Gemini AI models and OpenAI's GPT Image models.

## Features

- 🎨 Generate high-quality images from text prompts using Gemini and OpenAI models
- 🖼️ Source/reference image support for editing, style transfer, and character consistency
- 📐 Customizable aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4)
- 🔧 Configurable image sizes with provider-aware mapping
- 🤖 OpenAI support for GPT Image models, including `gpt-image-2`, `gpt-image-1.5`, and `chatgpt-image-latest`
- 🧩 Provider is inferred automatically from the selected model
- ⚙️ Flexible configuration via JSON file
- 💾 Automatic local image saving with organized filenames (saves to ~/gemini_images by default)
- 🚀 Built on the MCP SDK for seamless integration

## Models Supported

- **gemini-3-pro-image-preview** (Default): Professional-grade, supports up to 4K resolution
- **gemini-3.1-flash-image-preview**: High-efficiency counterpart to Gemini 3 Pro, optimized for speed and high-volume use; supports up to 4K resolution
- **gemini-2.5-flash-image**: Optimized for speed, generates 1024px resolution
- **gpt-image-2**: Experimental OpenAI model string accepted by this server
- **gpt-image-1.5**: Latest documented dedicated OpenAI image generation model
- **chatgpt-image-latest**: The image model currently used in ChatGPT
- **gpt-image-1**: Previous GPT Image generation model
- **gpt-image-1-mini**: Lower-cost GPT Image variant

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Legorobotdude/mcp-image-gen.git
cd mcp-image-gen
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the project:
```bash
pnpm build
```

## Configuration

### Environment Variables

Set one or both provider API keys:
```bash
export GEMINI_API_KEY=your_api_key_here
export OPENAI_API_KEY=your_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey).
Get your OpenAI API key from [OpenAI](https://platform.openai.com/api-keys).

### Config File (Optional)

Create a `config.json` file in the project root to customize defaults:

```json
{
  "model": "gemini-3-pro-image-preview",
  "defaultAspectRatio": "1:1",
  "defaultImageSize": "large",
  "outputDirectory": "~/gemini_images"
}
```

**Available Options:**

- `model`:
  - Gemini: `"gemini-3-pro-image-preview"` (default), `"gemini-3.1-flash-image-preview"`, `"gemini-2.5-flash-image"`
  - OpenAI: `"gpt-image-2"`, `"gpt-image-1.5"`, `"chatgpt-image-latest"`, `"gpt-image-1"`, `"gpt-image-1-mini"`
- `defaultAspectRatio`: `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, or `"3:4"`
- `defaultImageSize`:
  - `"small"` (1K - 1024px)
  - `"medium"` (2K - 2048px)
  - `"large"` (2K - 2048px)
  - `"xlarge"` (4K - 4096px - only for gemini-3.1-flash-image-preview and gemini-3-pro-image-preview)
- `outputDirectory`: Path where generated images will be saved (default: `~/gemini_images`, can use absolute paths or `~` for home directory)

## Usage with Claude Desktop

Add to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-image-gen": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-image-gen/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here",
        "OPENAI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Tool: `generate_image`

Generate an image from a text prompt.

### Parameters

- **prompt** (required): Text description of the image to generate
- **model** (optional): Gemini or OpenAI image model. Provider is inferred automatically from the model. Defaults to server config.
- **aspectRatio** (optional): Aspect ratio - `"1:1"`, `"2:3"`, `"3:2"`, `"3:4"`, `"4:3"`, `"4:5"`, `"5:4"`, `"9:16"`, `"16:9"`, `"21:9"`
- **imageSize** (optional): Resolution - `"small"` (1K), `"medium"` (2K), `"large"` (2K), `"xlarge"` (4K)
- **negativePrompt** (optional): Describe what you DON'T want in the image
- **sourceImages** (optional): Array of absolute file paths to source/reference images
  - Gemini: png, jpg, jpeg, gif, webp; max 14 images
  - OpenAI: png, jpg, jpeg, webp; max 16 images

The server still accepts OpenAI-specific `quality` and `background` arguments for direct callers, but they are no longer advertised in the MCP schema. OpenAI moderation is fixed to `low`.

### Example Usage in Claude

```
Generate an image of a serene mountain landscape at sunset with vibrant colors
```

```
Create a 16:9 image of a futuristic city skyline at night in xlarge size with Gemini
```

```
Generate a portrait of a wise old wizard with a long beard, aspect ratio 3:4, medium size, using model gpt-image-1.5
```

```
Edit this photo to make it look like a watercolor painting (with sourceImages: ["/path/to/photo.jpg"])
```

```
Create a product cutout using model chatgpt-image-latest
```

## Response Format

The tool returns a JSON response with:

```json
{
  "success": true,
  "imagePath": "/Users/yourusername/gemini_images/1234567890_serene_mountain_landscape.png",
  "provider": "openai",
  "prompt": "serene mountain landscape at sunset",
  "model": "gpt-image-1.5",
  "aspectRatio": "1:1",
  "imageSize": "large",
  "message": "Image generated successfully and saved to: /Users/yourusername/gemini_images/1234567890_serene_mountain_landscape.png"
}
```

## Image Quality Notes

- All generated images include a SynthID watermark (Google's digital watermark)
- **gemini-3-pro-image-preview** (default): Best for high-quality, detailed images up to 4K
- **gemini-3.1-flash-image-preview**: Best for speed and high-volume use, supports up to 4K
- **gemini-2.5-flash-image**: Best for quick generation, fixed at 1024px resolution
- **gpt-image-1.5**: Best OpenAI image quality and instruction following
- **chatgpt-image-latest**: Tracks the image model currently used in ChatGPT
- OpenAI GPT Image models support square, landscape, and portrait sizes. Non-square aspect ratios are mapped to the closest supported OpenAI size.
- OpenAI moderation is hardcoded to the least restrictive documented setting, `low`.

## Development

Watch mode for development:
```bash
pnpm dev
```

Build for production:
```bash
pnpm build
```

## Troubleshooting

### "set GEMINI_API_KEY and/or OPENAI_API_KEY"
Make sure you've set at least one provider API key or added it to your MCP configuration.

### Images not generating
- Check your API key is valid
- Verify you have internet connectivity
- Ensure the output directory is writable

### Size options not working
The `gemini-2.5-flash-image` model only supports 1024px resolution regardless of the size parameter. Use `gemini-3-pro-image-preview` or `gemini-3.1-flash-image-preview` for higher resolutions.

### OpenAI aspect ratios look approximate
OpenAI GPT Image models support `1024x1024`, `1536x1024`, and `1024x1536`. Wider or taller aspect ratios are mapped to the nearest supported landscape or portrait size.

## License

MIT

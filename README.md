# MCP Image Gen

A Model Context Protocol (MCP) server for generating images using Google's Gemini AI models and OpenAI's GPT Image models.

## Features

- 🎨 Generate high-quality images from text prompts using Gemini and OpenAI models
- 🖼️ Source/reference image support for editing, style transfer, and character consistency
- 📐 Customizable aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4)
- 🔧 Configurable image sizes with provider-aware mapping
- 🤖 OpenAI support for GPT Image models, including GPT Image 2.5 (`gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`), `gpt-image-2`, `gpt-image-1.5`, and `chatgpt-image-latest`
- 🧩 Provider is inferred automatically from the selected model
- ⚙️ Flexible configuration via JSON file
- 💾 Automatic local image saving with organized filenames (saves to ~/gemini_images by default)
- 🚀 Built on the MCP SDK for seamless integration

## Models Supported

- **gemini-3-pro-image-preview** (Default): Professional-grade, supports up to 4K resolution
- **gemini-3.1-flash-image-preview**: High-efficiency counterpart to Gemini 3 Pro, optimized for speed and high-volume use; supports up to 4K resolution
- **gemini-2.5-flash-image**: Optimized for speed, generates 1024px resolution
- **gpt-image-2.5-flare**: Fast GPT Image 2.5 model (OpenAI default when OpenAI is selected); quality comparable to GPT Image 2 at lower latency; up to ~4K
- **gpt-image-2.5-sunburst**: Higher-quality GPT Image 2.5 model for precise edits; up to ~4K
- **gpt-image-2**: Previous-generation OpenAI image model
- **gpt-image-1.5**: Dedicated OpenAI image generation model
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
  - OpenAI: `"gpt-image-2.5-flare"`, `"gpt-image-2.5-sunburst"`, `"gpt-image-2"`, `"gpt-image-1.5"`, `"chatgpt-image-latest"`, `"gpt-image-1"`, `"gpt-image-1-mini"`
- `defaultAspectRatio`: `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, or `"3:4"`
- `defaultImageSize`:
  - `"small"` (1K - 1024px)
  - `"medium"` (2K - 2048px)
  - `"large"` (2K - 2048px)
  - `"xlarge"` (4K - 4096px - Gemini 3 / GPT Image 2.5; older OpenAI models map this to quality only)
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
- **quality** (optional): OpenAI only - `"auto"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"max"` (`xhigh`/`max` require GPT Image 2.5)
- **background** (optional): OpenAI only - `"auto"`, `"transparent"`, `"opaque"`
- **negativePrompt** (optional): Describe what you DON'T want in the image
- **sourceImages** (optional): Array of absolute file paths to source/reference images
  - Gemini: png, jpg, jpeg, gif, webp; max 14 images
  - OpenAI: png, jpg, jpeg, webp; max 16 images

OpenAI moderation is fixed to `low`.

### Example Usage in Claude

```
Generate an image of a serene mountain landscape at sunset with vibrant colors
```

```
Create a 16:9 image of a futuristic city skyline at night in xlarge size with Gemini
```

```
Generate a portrait of a wise old wizard with a long beard, aspect ratio 3:4, medium size, using model gpt-image-2.5-flare
```

```
Edit this photo to make it look like a watercolor painting (with sourceImages: ["/path/to/photo.jpg"])
```

```
Create a product cutout using model gpt-image-2.5-sunburst
```

## Response Format

The tool returns a JSON response with:

```json
{
  "success": true,
  "imagePath": "/Users/yourusername/gemini_images/1234567890_serene_mountain_landscape.png",
  "provider": "openai",
  "prompt": "serene mountain landscape at sunset",
  "model": "gpt-image-2.5-flare",
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
- **gpt-image-2.5-flare**: Default OpenAI model; fast GPT Image 2.5 with up to ~4K custom sizes
- **gpt-image-2.5-sunburst**: Prefer for precise edits and higher visual quality
- **gpt-image-1.5**: Prior dedicated OpenAI image model
- **chatgpt-image-latest**: Tracks the image model currently used in ChatGPT
- GPT Image 2.5 maps `imageSize` to real pixels (small≈1K, medium/large≈2K, xlarge≈4K). Older OpenAI models keep fixed 1024/1536 sizes and map `imageSize` to quality instead.
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
The `gemini-2.5-flash-image` model only supports 1024px resolution regardless of the size parameter. Use `gemini-3-pro-image-preview` or `gemini-3.1-flash-image-preview` for higher resolutions. For OpenAI, use `gpt-image-2.5-flare` or `gpt-image-2.5-sunburst` for 2K/4K; older GPT Image models max out at 1536px.

### OpenAI aspect ratios look approximate
Pre-2.5 OpenAI models support `1024x1024`, `1536x1024`, and `1024x1536`. Wider or taller aspect ratios are mapped to the nearest supported landscape or portrait size. GPT Image 2.5 uses custom WxH sized to the requested aspect ratio within API limits.

## License

MIT

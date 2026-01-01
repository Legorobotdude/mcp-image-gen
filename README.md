# MCP Image Gen

A Model Context Protocol (MCP) server for generating images using Google's Gemini AI models.

## Features

- 🎨 Generate high-quality images from text prompts using Gemini AI
- 📐 Customizable aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4)
- 🔧 Configurable image sizes (small to 4K resolution)
- ⚙️ Flexible configuration via JSON file
- 💾 Automatic local image saving with organized filenames (saves to ~/gemini_images by default)
- 🚀 Built on the MCP SDK for seamless integration

## ⚠️ Known Issues

- **Aspect ratio and image size parameters may not be working correctly** - Images are currently being generated in landscape format regardless of the specified aspect ratio. This is being investigated. The API calls appear correct, but the Gemini API may not be respecting the configuration parameters as expected.

## Models Supported

- **gemini-3-pro-image-preview** (Default): Professional-grade, supports up to 4K resolution
- **gemini-2.5-flash-image**: Optimized for speed, generates 1024px resolution

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mcp-image-gen.git
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

Set your Gemini API key:
```bash
export GEMINI_API_KEY=your_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey).

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

- `model`: `"gemini-3-pro-image-preview"` or `"gemini-2.5-flash-image"`
- `defaultAspectRatio`: `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, or `"3:4"`
- `defaultImageSize`:
  - `"small"` (1K - 1024px)
  - `"medium"` (2K - 2048px)
  - `"large"` (2K - 2048px)
  - `"xlarge"` (4K - 4096px - only for gemini-3-pro-image-preview)
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
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Tool: `generate_image`

Generate an image from a text prompt.

### Parameters

- **prompt** (required): Text description of the image to generate
- **aspectRatio** (optional): Aspect ratio - `"1:1"`, `"2:3"`, `"3:2"`, `"3:4"`, `"4:3"`, `"4:5"`, `"5:4"`, `"9:16"`, `"16:9"`, `"21:9"`
- **imageSize** (optional): Resolution - `"small"` (1K), `"medium"` (2K), `"large"` (2K), `"xlarge"` (4K)
- **negativePrompt** (optional): Describe what you DON'T want in the image

### Example Usage in Claude

```
Generate an image of a serene mountain landscape at sunset with vibrant colors
```

```
Create a 16:9 image of a futuristic city skyline at night in xlarge size
```

```
Generate a portrait of a wise old wizard with a long beard, aspect ratio 3:4, medium size
```

## Response Format

The tool returns a JSON response with:

```json
{
  "success": true,
  "imagePath": "/Users/yourusername/gemini_images/1234567890_serene_mountain_landscape.png",
  "prompt": "serene mountain landscape at sunset",
  "model": "gemini-3-pro-image-preview",
  "aspectRatio": "1:1",
  "imageSize": "large",
  "message": "Image generated successfully and saved to: /Users/yourusername/gemini_images/1234567890_serene_mountain_landscape.png"
}
```

## Image Quality Notes

- All generated images include a SynthID watermark (Google's digital watermark)
- **gemini-3-pro-image-preview**: Best for high-quality, detailed images up to 4K
- **gemini-2.5-flash-image**: Best for quick generation, fixed at 1024px resolution

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

### "GEMINI_API_KEY environment variable is required"
Make sure you've set the `GEMINI_API_KEY` environment variable or added it to your MCP configuration.

### Images not generating
- Check your API key is valid
- Verify you have internet connectivity
- Ensure the output directory is writable

### Size options not working
The `gemini-2.5-flash-image` model only supports 1024px resolution regardless of the size parameter. Use `gemini-3-pro-image-preview` for higher resolutions.

## License

MIT

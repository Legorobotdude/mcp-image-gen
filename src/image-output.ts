import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { embedPngMetadata } from './png-metadata.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Frame markers carrying a JPEG's dimensions: baseline, extended, progressive
 * and lossless, in both Huffman (C0-C3, C5-C7) and arithmetic (C9-CB, CD-CF)
 * codings. The gaps are other segments that share the SOFn range: C4 (DHT),
 * C8 (reserved) and CC (DAC).
 */
function isJpegFrameMarker(marker: number): boolean {
  if (marker < 0xc0 || marker > 0xcf) return false;
  return marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpegDimensions(
  buffer: Buffer
): { width: number; height: number } | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return undefined;
  }
  // Walk the segment chain to the frame header. Every segment is FF <marker>
  // <2-byte length, inclusive of itself>, except the standalone markers below,
  // which carry no payload and so no length to skip.
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1; // Resync past fill bytes rather than trusting the stream.
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1; // Fill byte; the real marker is the next non-FF.
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      return undefined; // End of image, or entropy-coded scan: no header ahead.
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined; // Malformed: would not advance.
    if (isJpegFrameMarker(marker)) {
      // SOFn payload: precision (1 byte), then height and width as uint16.
      if (offset + 9 >= buffer.length) return undefined;
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + length;
  }
  return undefined;
}

/**
 * Pixel dimensions from a PNG or JPEG buffer, or undefined when the format is
 * neither or the header is truncated. xAI returns JPEG, so a PNG-only reader
 * left every xAI result without a width or height.
 */
export function readImageDimensions(
  buffer: Buffer
): { width: number; height: number } | undefined {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  return readJpegDimensions(buffer);
}

export function ensureOutputDirectory(outputDirectory: string): void {
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }
}

function sanitizePromptForFilename(prompt: string): string {
  return (
    prompt
      .substring(0, 50)
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'image'
  );
}

export function savePngWithMetadata(params: {
  outputDirectory: string;
  prompt: string;
  imageBuffer: Buffer;
  metadata: Record<string, string>;
}): string {
  const { outputDirectory, prompt, imageBuffer, metadata } = params;

  ensureOutputDirectory(outputDirectory);

  const timestamp = Date.now();
  const sanitizedPrompt = sanitizePromptForFilename(prompt);
  const filepath = join(outputDirectory, `${timestamp}_${sanitizedPrompt}.png`);
  const buffer = embedPngMetadata(imageBuffer, metadata);

  writeFileSync(filepath, buffer);

  return filepath;
}

// PNG metadata embedding would corrupt non-PNG formats, so those are saved as-is.
export function saveGeneratedImage(params: {
  outputDirectory: string;
  prompt: string;
  imageBuffer: Buffer;
  metadata: Record<string, string>;
  mimeType?: string;
}): string {
  const { outputDirectory, prompt, imageBuffer, mimeType } = params;

  if (!mimeType || mimeType === 'image/png') {
    return savePngWithMetadata(params);
  }

  ensureOutputDirectory(outputDirectory);

  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
  const filepath = join(
    outputDirectory,
    `${Date.now()}_${sanitizePromptForFilename(prompt)}.${extension}`
  );

  writeFileSync(filepath, imageBuffer);

  return filepath;
}

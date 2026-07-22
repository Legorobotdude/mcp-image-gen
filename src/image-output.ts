import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { embedPngMetadata } from './png-metadata.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngDimensions(
  buffer: Buffer
): { width: number; height: number } | undefined {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return undefined;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
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

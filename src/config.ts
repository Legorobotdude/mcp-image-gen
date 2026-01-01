import { readFileSync, existsSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { homedir } from 'os';
import type { ServerConfig } from './types.js';

const DEFAULT_CONFIG: Required<ServerConfig> = {
  model: 'gemini-3-pro-image-preview',
  defaultAspectRatio: '1:1',
  defaultImageSize: 'large',
  outputDirectory: join(homedir(), 'gemini_images')
};

function resolveOutputPath(path: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  // Resolve relative paths from user's home directory
  return resolve(homedir(), path);
}

export function loadConfig(): Required<ServerConfig> {
  const configPath = join(process.cwd(), 'config.json');

  let config: Required<ServerConfig>;

  if (!existsSync(configPath)) {
    config = DEFAULT_CONFIG;
  } else {
    try {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<ServerConfig>;
      config = {
        ...DEFAULT_CONFIG,
        ...userConfig
      };
    } catch (error) {
      console.error('Error reading config.json, using defaults:', error);
      config = DEFAULT_CONFIG;
    }
  }

  // Ensure output directory is an absolute path
  config.outputDirectory = resolveOutputPath(config.outputDirectory);

  return config;
}

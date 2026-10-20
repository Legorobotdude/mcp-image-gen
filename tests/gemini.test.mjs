import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { loadConfig } from '../dist/config.js';
import { GeminiImageGenerator, describeMissingImage } from '../dist/gemini.js';
import {
  ALL_MODELS,
  GEMINI_MODELS,
  getProviderForModel,
  isGeminiModel,
  isOpenAIModel,
  isXAIModel,
} from '../dist/types.js';

// Run with: pnpm build && node --test tests/gemini.test.mjs
const NANO_BANANA_21 = 'gemini-nano-banana-2.1';

test(`${NANO_BANANA_21} is registered as a Gemini model and routes to the Gemini provider`, (t) => {
  t.diagnostic(`GEMINI_MODELS: ${GEMINI_MODELS.join(', ')}`);
  assert.ok(GEMINI_MODELS.includes(NANO_BANANA_21), 'missing from GEMINI_MODELS');
  assert.ok(ALL_MODELS.includes(NANO_BANANA_21), 'missing from ALL_MODELS (tool enum)');
  assert.equal(isGeminiModel(NANO_BANANA_21), true);
  assert.equal(isOpenAIModel(NANO_BANANA_21), false);
  assert.equal(isXAIModel(NANO_BANANA_21), false);
  assert.equal(getProviderForModel(NANO_BANANA_21), 'gemini');
});

test('gemini-3.1-flash-image-preview stays available alongside its successor', () => {
  assert.ok(ALL_MODELS.includes('gemini-3.1-flash-image-preview'));
  assert.equal(getProviderForModel('gemini-3.1-flash-image-preview'), 'gemini');
});

test('default model without a config.json is still gemini-3-pro-image-preview', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'gemini-config-test-'));
  const previousCwd = process.cwd();
  process.chdir(directory);
  t.after(() => {
    process.chdir(previousCwd);
    rmSync(directory, { recursive: true, force: true });
  });

  const config = loadConfig();
  t.diagnostic(`loadConfig() from empty cwd ${directory}: ${JSON.stringify(config)}`);
  assert.equal(config.model, 'gemini-3-pro-image-preview');
});

test(`${NANO_BANANA_21} rejects more than 14 source images before calling the API`, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'gemini-source-limit-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const sourceImages = [];
  for (let index = 0; index < 15; index++) {
    const buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: index * 16, g: 0, b: 0 } },
    }).png().toBuffer();
    const path = join(directory, `source-${index}.png`);
    writeFileSync(path, buffer);
    sourceImages.push(path);
  }
  t.diagnostic(`created ${sourceImages.length} source images in ${directory}`);

  // The key is never sent: the source-image limit is enforced before generateContent runs.
  const generator = new GeminiImageGenerator('unused-key', NANO_BANANA_21, directory);
  await assert.rejects(
    generator.generateImage({ prompt: 'Combine the references', model: NANO_BANANA_21, sourceImages }),
    /Too many source images: 15\. Maximum is 14\./
  );
});

test('describeMissingImage reports the candidate finish reason and model text', (t) => {
  const message = describeMissingImage({
    candidates: [{ finishReason: 'PROHIBITED_CONTENT', content: { parts: [{ text: 'I cannot create that image.' }] } }],
  });
  t.diagnostic(message);
  assert.equal(message, 'No image data found in response (finishReason: PROHIBITED_CONTENT; model text: I cannot create that image.)');
});

test('describeMissingImage reports a blocked prompt that returned no candidates', (t) => {
  const message = describeMissingImage({ promptFeedback: { blockReason: 'OTHER', blockReasonMessage: 'policy' } });
  t.diagnostic(message);
  assert.equal(message, 'No image data found in response (prompt blocked: OTHER (policy))');
});

test('describeMissingImage says when the response had no candidates and no block reason', (t) => {
  const message = describeMissingImage({});
  t.diagnostic(message);
  assert.equal(message, 'No image data found in response (no candidates returned)');
});

test('describeMissingImage includes a finish message and ignores empty text parts', (t) => {
  const message = describeMissingImage({
    candidates: [{ finishReason: 'IMAGE_OTHER', finishMessage: 'Unable to generate', content: { parts: [{ text: '' }] } }],
  });
  t.diagnostic(message);
  assert.equal(message, 'No image data found in response (finishReason: IMAGE_OTHER; finishMessage: Unable to generate)');
});

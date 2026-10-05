import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { XAIImageGenerator } from '../dist/xai.js';

// Run with: pnpm build && node --test tests/xai.test.mjs
for (const model of ['grok-imagine-image', 'grok-imagine-image-quality']) {
  for (const count of [0, 1, 2, 3]) {
    test(`${model}: request with ${count} source images`, async (t) => {
      const directory = mkdtempSync(join(tmpdir(), 'xai-request-test-'));
      const previousKey = process.env.XAI_API_KEY;
      process.env.XAI_API_KEY = 'test-key';
      t.after(() => {
        if (previousKey === undefined) delete process.env.XAI_API_KEY;
        else process.env.XAI_API_KEY = previousKey;
        rmSync(directory, { recursive: true, force: true });
      });

      const sourceImages = [];
      const references = [];
      for (let index = 0; index < count; index++) {
        const buffer = await sharp({
          create: { width: 8, height: 8, channels: 3, background: { r: index * 80, g: 0, b: 0 } },
        }).png().toBuffer();
        const path = join(directory, `source-${index}.png`);
        writeFileSync(path, buffer);
        sourceImages.push(path);
        references.push({ url: `data:image/png;base64,${buffer.toString('base64')}`, type: 'image_url' });
      }

      const output = await sharp({
        create: { width: 8, height: 8, channels: 3, background: 'white' },
      }).png().toBuffer();
      const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, `https://api.x.ai/v1/images/${count ? 'edits' : 'generations'}`);
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.equal(body.model, model);
        assert.equal(body.prompt, 'Combine the references');
        assert.equal(body.response_format, 'b64_json');
        assert.equal(body.resolution, '2k');
        assert.equal(body.aspect_ratio, count ? undefined : '1:1');
        if (count === 0) {
          assert.equal(Object.hasOwn(body, 'image'), false);
          assert.equal(Object.hasOwn(body, 'images'), false);
        } else if (count === 1) {
          assert.deepEqual(body.image, references[0]);
          assert.equal(Object.hasOwn(body, 'images'), false);
        } else {
          assert.deepEqual(body.images, references);
          assert.equal(Object.hasOwn(body, 'image'), false);
        }
        return Response.json({ data: [{ b64_json: output.toString('base64'), mime_type: 'image/png' }] });
      });

      const generator = new XAIImageGenerator(model, directory);
      const result = await generator.generateImage({ prompt: 'Combine the references', sourceImages });
      assert.equal(fetchMock.mock.callCount(), 1);
      assert.equal(result.provider, 'xai');
      assert.equal(result.width, 8);
      assert.equal(result.height, 8);
      assert.ok(readFileSync(result.imagePath).length > 0);
    });
  }
}

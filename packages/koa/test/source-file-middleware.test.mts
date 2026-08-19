import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import Koa from 'koa';

import { createSourceFileMiddleware } from '../src/source-file-middleware.mts';

test('serves TypeScript source extensions as text/typescript', async () => {
  await withSourceServer(async origin => {
    for (const extension of ['ts', 'tsx', 'mts', 'cts']) {
      const response = await fetch(`${origin}/source.${extension}`);

      assert.equal(
        response.headers.get('Content-Type'),
        'text/typescript; charset=utf-8',
      );
    }
  });
});

test('serves JavaScript source extensions as text/javascript', async () => {
  await withSourceServer(async origin => {
    for (const extension of ['js', 'jsx', 'mjs', 'cjs']) {
      const response = await fetch(`${origin}/source.${extension}`);

      assert.equal(
        response.headers.get('Content-Type'),
        'text/javascript; charset=utf-8',
      );
    }
  });
});

test('preserves JavaScript MIME type for transpiled TypeScript', async () => {
  await withSourceServer(async origin => {
    const response = await fetch(`${origin}/source.ts?transpiled=true`);

    assert.equal(
      response.headers.get('Content-Type'),
      'text/javascript; charset=utf-8',
    );
  });
});

async function withSourceServer(
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const app = new Koa();
  app.use(createSourceFileMiddleware());
  app.use(ctx => {
    ctx.body = 'export {};';

    if (ctx.query['transpiled'] === 'true') {
      ctx.type = 'text/javascript';
    }
  });

  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

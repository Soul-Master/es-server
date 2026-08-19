import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import Koa from 'koa';

import {
  createHtmlMiddleware,
  transformHtml,
} from '../src/html-middleware.mts';

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

test('replaces an external import map with inline JSON and the worker loader', () => {
  const html = transformHtml(`<!doctype html>
    <script src="./import-map.json" type="IMPORTMAP"></script>`, {
    imports: { react: 'https://esm.sh/react?target=es2024' },
  });

  assert.match(
    html,
    /<script type="importmap">{"imports":{"react":"https:\/\/esm\.sh\/react\?target=es2024"}}<\/script>/,
  );
  assert.match(
    html,
    /<script type="module" src="\/@es-server\/service-worker-loader\.mts"><\/script>/,
  );
  assert.doesNotMatch(html, /\.\/import-map\.json/);
});

test('collapses multiple inline and external maps into one generated map', () => {
  const html = transformHtml(`
    <script type='importmap'>{"imports":{"one":"/one.js"}}</script>
    <script type=importmap src="/map.json"></script>
    <script type="module" src="/main.js"></script>`, {
    imports: { one: '/one.js', two: '/two.js' },
  });

  assert.equal(html.match(/type="importmap"/g)?.length, 1);
  assert.doesNotMatch(html, /src="\/@es-server\/importmap"/);
  assert.match(html, /"two":"\/two\.js"/);
  assert.equal(html.match(/service-worker-loader/g)?.length, 1);
  assert.match(html, /<script type="module" src="\/main\.js"><\/script>/);
});

test('inserts tooling after the title when no import map is declared', () => {
  const html = transformHtml(
    '<!doctype html><html><head><title>App</title><meta charset="utf-8"></head></html>',
    { imports: {} },
  );

  assert.match(
    html,
    /<title>App<\/title>\n<script type="importmap">{"imports":{}}<\/script>\n<script type="module"[^>]*><\/script><meta/,
  );
});

test('escapes HTML-sensitive characters in inline import-map JSON', () => {
  const html = transformHtml('<title>App</title>', {
    imports: { unsafe: '</script><script>alert(1)</script>' },
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /\\u003c\/script>/);
});

test('transforms a downstream Koa HTML response', async () => {
  const app = new Koa();
  app.use(createHtmlMiddleware({ rootDirectory: workspaceRoot }));
  app.use(ctx => {
    ctx.type = 'html';
    ctx.body = '<script type="importmap">{"imports":{}}</script>';
  });

  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();

    assert.match(html, /<script type="importmap">{"imports":/);
    assert.doesNotMatch(html, /src="\/@es-server\/importmap"/);
    assert.match(html, /target=es2024/);
    assert.match(html, /service-worker-loader\.mts/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
});

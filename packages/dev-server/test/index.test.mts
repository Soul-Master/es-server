import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createDevServerHandler,
  generateImportMap,
  type DevServerRequest,
} from '../src/index.mts';

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const handler = createDevServerHandler({ rootDirectory: workspaceRoot });

test('transforms explicitly accepted TypeScript requests', async () => {
  const response = await handler(
    createRequest(
      '/packages/dev-server/src/index.mts',
      'text/javascript',
    ),
  );

  assert.equal(response?.status, 200);
  assert.equal(
    response?.headers?.['Content-Type'],
    'text/javascript; charset=utf-8',
  );
  assert.doesNotMatch(response?.body ?? '', /export interface DevServerRequest/);
});

test('passes through TypeScript requests without an explicit accept type', async () => {
  const response = await handler(
    createRequest('/packages/dev-server/src/index.mts', '*/*'),
  );

  assert.equal(response, undefined);
});

test('serves the bundled browser tooling', async () => {
  const response = await handler(
    createRequest('/@es-server/importmap.mts'),
  );

  assert.equal(response?.status, 200);
  assert.equal(
    response?.headers?.['Content-Type'],
    'text/javascript; charset=utf-8',
  );
});

test('generates an import map from project dependencies', async () => {
  const importMap = await generateImportMap({
    rootDirectory: workspaceRoot,
    documentURL: 'http://localhost/index.html',
    html: '<script type="importmap">{"imports":{"app":"/app.js"}}</script>',
  }) as { imports?: Record<string, string> };

  assert.equal(
    importMap.imports?.['react'],
    'https://esm.sh/react@~19.2.8?target=es2024',
  );
  assert.equal(
    importMap.imports?.['react/'],
    'https://esm.sh/react@~19.2.8&target=es2024/',
  );
  assert.equal(importMap.imports?.['app'], '/app.js');
});

test('uses the configured target in esm.sh package URLs', async () => {
  const importMap = await generateImportMap({
    rootDirectory: workspaceRoot,
    documentURL: 'http://localhost/index.html',
    html: '<html></html>',
    target: 2020,
  }) as { imports?: Record<string, string> };

  assert.equal(
    importMap.imports?.['react'],
    'https://esm.sh/react@~19.2.8?target=es2020',
  );
  assert.equal(
    importMap.imports?.['react/'],
    'https://esm.sh/react@~19.2.8&target=es2020/',
  );
});

test('rejects an unsupported esm.sh target', async () => {
  await assert.rejects(
    generateImportMap({
      rootDirectory: workspaceRoot,
      documentURL: 'http://localhost/index.html',
      html: '<html></html>',
      target: 2014 as 2015,
    }),
    /Unsupported ECMAScript target: 2014/,
  );
});

function createRequest(
  path: string,
  accept?: string,
  referer?: string,
): DevServerRequest {
  return {
    method: 'GET',
    path,
    getHeader(name) {
      if (name.toLowerCase() === 'accept') return accept;
      if (name.toLowerCase() === 'referer') return referer;
      return undefined;
    },
  };
}

import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createDevServerHandler,
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
    createRequest('/@es-server/load-typescript.mts'),
  );

  assert.equal(response?.status, 200);
  assert.equal(
    response?.headers?.['Content-Type'],
    'text/javascript; charset=utf-8',
  );
});

function createRequest(
  path: string,
  accept?: string,
): DevServerRequest {
  return {
    method: 'GET',
    path,
    getHeader(name) {
      return name.toLowerCase() === 'accept' ? accept : undefined;
    },
  };
}

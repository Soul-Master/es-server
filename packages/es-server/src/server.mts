#!/usr/bin/env node

import { resolve } from 'node:path';

import {
  startKoaServer,
  type KoaServerOptions,
} from '@es-server/koa';

const projectRoot: string = resolve(process.argv[2] ?? process.cwd());
const host: string = process.env['HOST'] ?? '127.0.0.1';
const port: number = parsePort(process.env['PORT']);
const target = parseTarget(process.env['TARGET']);
startKoaServer({
  rootDirectory: projectRoot,
  host,
  port,
  target,
  onListening() {
    console.log(`ES Server: http://${host}:${port}`);
    console.log(`Serving: ${projectRoot}`);
  },
});

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '8080', 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

function parseTarget(
  value: string | undefined,
): NonNullable<KoaServerOptions['target']> {
  const target = Number(value ?? '2024');

  if (!Number.isInteger(target) || target < 2015 || target > 2024) {
    throw new Error(`Invalid TARGET value: ${value}`);
  }

  return target as NonNullable<KoaServerOptions['target']>;
}

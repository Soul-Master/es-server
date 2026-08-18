import type { Server } from 'node:http';

import {
  createDevServerHandler,
  type DevServerOptions,
} from '@es-server/dev-server';
import Koa from 'koa';
import serveStatic from 'koa-static';

import { createKoaMiddleware } from './middleware.mts';

export type KoaServerOptions = DevServerOptions;

export type StartKoaServerOptions = KoaServerOptions & {
  host: string;
  port: number;
  onListening?: () => void;
};

export function createKoaApp({
  rootDirectory,
  toolingDirectory,
}: KoaServerOptions): Koa {
  const app = new Koa();

  app.use(
    createKoaMiddleware(
      createDevServerHandler({
        rootDirectory,
        ...(toolingDirectory === undefined ? {} : { toolingDirectory }),
      }),
    ),
  );
  app.use(
    serveStatic(rootDirectory, {
      index: 'index.html',
      setHeaders(response, filePath) {
        if (filePath.endsWith('.mts')) {
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
        }
      },
    }),
  );

  app.use(ctx => {
    ctx.status = 404;
    ctx.body = 'Not Found';
  });

  app.on('error', error => {
    console.error(error);
  });

  return app;
}

export function startKoaServer({
  host,
  port,
  onListening,
  ...appOptions
}: StartKoaServerOptions): Server {
  return createKoaApp(appOptions).listen(port, host, onListening);
}

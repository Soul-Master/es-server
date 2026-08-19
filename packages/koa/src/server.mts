import type { Server } from 'node:http';

import {
  createDevServerHandler,
  type DevServerOptions,
} from '@es-server/dev-server';
import Koa from 'koa';
import serveStatic from 'koa-static';

import { createKoaMiddleware } from './middleware.mts';
import { createHtmlMiddleware } from './html-middleware.mts';
import { createSourceFileMiddleware } from './source-file-middleware.mts';

export type KoaServerOptions = DevServerOptions;

export type StartKoaServerOptions = KoaServerOptions & {
  host: string;
  port: number;
  onListening?: () => void;
};

export function createKoaApp({
  rootDirectory,
  target,
  toolingDirectory,
}: KoaServerOptions): Koa {
  const app = new Koa();

  app.use(
    createHtmlMiddleware({
      rootDirectory,
      ...(target === undefined ? {} : { target }),
    }),
  );
  app.use(createSourceFileMiddleware());
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

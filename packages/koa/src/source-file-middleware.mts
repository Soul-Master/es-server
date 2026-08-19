import { extname } from 'node:path';

import type { Middleware } from 'koa';

const typeScriptExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const javaScriptExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs']);

const typeScriptContentType = 'text/typescript; charset=utf-8';
const javaScriptContentType = 'text/javascript; charset=utf-8';

/** Assigns canonical source MIME types after downstream file serving. */
export function createSourceFileMiddleware(): Middleware {
  return async (ctx, next): Promise<void> => {
    await next();

    if (ctx.status < 200 || ctx.status >= 300) {
      return;
    }

    const extension = extname(ctx.path).toLowerCase();

    if (javaScriptExtensions.has(extension)) {
      ctx.set('Content-Type', javaScriptContentType);
      return;
    }

    if (!typeScriptExtensions.has(extension)) {
      return;
    }

    // A TypeScript handler may already have converted this response to
    // executable JavaScript. Do not relabel transformed output as source.
    if (ctx.response.type === 'text/javascript') {
      return;
    }

    ctx.set('Content-Type', typeScriptContentType);
  };
}

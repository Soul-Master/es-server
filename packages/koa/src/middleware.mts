import type {
  DevServerHandler,
  DevServerResponse,
} from '@es-server/dev-server';
import type { Middleware } from 'koa';

export function createKoaMiddleware(handler: DevServerHandler): Middleware {
  return async (ctx, next): Promise<void> => {
    const response = await handler({
      method: ctx.method,
      path: ctx.path,
      getHeader(name) {
        return ctx.get(name) || undefined;
      },
    });

    if (!response) {
      await next();
      return;
    }

    applyResponse(ctx, response);
  };
}

function applyResponse(
  ctx: Parameters<Middleware>[0],
  response: DevServerResponse,
): void {
  ctx.status = response.status;

  for (const [name, value] of Object.entries(response.headers ?? {})) {
    ctx.set(name, value);
  }

  if (response.body !== undefined) {
    ctx.body = response.body;
  }
}

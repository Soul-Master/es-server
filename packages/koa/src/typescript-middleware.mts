import {
  createTypeScriptHandler,
  type TypeScriptHandlerOptions,
} from '@es-server/dev-server';
import type { Middleware } from 'koa';

import { createKoaMiddleware } from './middleware.mts';

export function createTypeScriptMiddleware({ rootDirectory }: TypeScriptHandlerOptions): Middleware {
  return createKoaMiddleware(createTypeScriptHandler({ rootDirectory }));
}

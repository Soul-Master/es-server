import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DevServerRequest {
  readonly method: string;
  readonly path: string;
  getHeader(name: string): string | undefined;
}

export interface DevServerResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export type DevServerHandler = (
  request: DevServerRequest,
) => Promise<DevServerResponse | undefined>;

export interface DevServerOptions {
  rootDirectory: string;
  toolingDirectory?: string;
}

export interface TypeScriptHandlerOptions {
  rootDirectory: string;
}

export interface ToolingHandlerOptions {
  toolingDirectory: string;
}

export function createDevServerHandler({
  rootDirectory,
  toolingDirectory = defaultToolingDirectory,
}: DevServerOptions): DevServerHandler {
  return composeHandlers(
    createToolingHandler({ toolingDirectory }),
    createTypeScriptHandler({ rootDirectory }),
  );
}

export function composeHandlers(
  ...handlers: readonly DevServerHandler[]
): DevServerHandler {
  return async request => {
    for (const handler of handlers) {
      const response = await handler(request);

      if (response) {
        return response;
      }
    }

    return undefined;
  };
}

export function createToolingHandler({
  toolingDirectory,
}: ToolingHandlerOptions): DevServerHandler {
  const root = resolve(toolingDirectory);

  return async request => {
    const fileName = toolingFiles.get(request.path);

    if (!fileName || !isReadRequest(request.method)) {
      return undefined;
    }

    const source = await readFile(resolve(root, fileName), 'utf8');
    const headers: Record<string, string> = {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    };

    if (fileName === 'sw.mts') {
      headers['Service-Worker-Allowed'] = '/';
    }

    return {
      status: 200,
      headers,
      body: stripTypeScriptTypes(source, {
        mode: 'strip',
        sourceUrl: request.path,
      }),
    };
  };
}

export function createTypeScriptHandler({
  rootDirectory,
}: TypeScriptHandlerOptions): DevServerHandler {
  const root = resolve(rootDirectory);

  return async request => {
    if (!isTypeScriptRequest(request)) {
      return undefined;
    }

    const filePath = resolveRequestPath(root, request.path);

    if (!filePath) {
      return {
        status: 403,
        body: 'Requested path is outside the project root',
      };
    }

    const source = await readFile(filePath, 'utf8').catch(
      (error: NodeJS.ErrnoException): null => {
        if (isMissingFileError(error)) {
          return null;
        }

        throw error;
      },
    );

    if (source === null) {
      return undefined;
    }

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body: stripTypeScriptTypes(source, {
        mode: 'strip',
        sourceUrl: request.path,
      }),
    };
  };
}

function isTypeScriptRequest(request: DevServerRequest): boolean {
  const extension = extname(request.path).toLowerCase();

  return (
    isReadRequest(request.method) &&
    (extension === '.ts' || extension === '.mts') &&
    explicitlyAcceptsOnlyJavaScript(request.getHeader('Accept'))
  );
}

function isReadRequest(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

function explicitlyAcceptsOnlyJavaScript(
  acceptHeader: string | undefined,
): boolean {
  if (!acceptHeader) {
    return false;
  }

  const mediaRanges = acceptHeader
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (mediaRanges.length !== 1) {
    return false;
  }

  const [mediaRange = ''] = mediaRanges;
  const [mediaType = '', ...parameters] = mediaRange.split(';');
  if (mediaType.trim().toLowerCase() !== 'text/javascript') {
    return false;
  }

  return !parameters.some(parameter => {
    const [name = '', value] = parameter.split('=').map(part => part.trim());
    return name.toLowerCase() === 'q' && Number(value) === 0;
  });
}

function resolveRequestPath(root: string, requestPath: string): string | null {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const filePath = resolve(root, `.${decodedPath}`);
  const relativePath = relative(root, filePath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

function isMissingFileError(error: NodeJS.ErrnoException): boolean {
  return error.code === 'ENOENT' || error.code === 'EISDIR';
}

type ToolingFileName =
  | 'importmap.mts'
  | 'load-typescript.mts'
  | 'service-worker-loader.mts'
  | 'sw.mts';

const toolingFiles: ReadonlyMap<string, ToolingFileName> = new Map([
  ['/@es-server/importmap.mts', 'importmap.mts'],
  ['/@es-server/load-typescript.mts', 'load-typescript.mts'],
  ['/@es-server/service-worker-loader.mts', 'service-worker-loader.mts'],
  ['/@es-server/sw.mts', 'sw.mts'],
]);

const defaultToolingDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tooling',
);

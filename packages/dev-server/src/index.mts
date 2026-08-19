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
  target?: ECMAScriptTarget;
  toolingDirectory?: string;
}

export type ECMAScriptTarget =
  | 2015
  | 2016
  | 2017
  | 2018
  | 2019
  | 2020
  | 2021
  | 2022
  | 2023
  | 2024;

export interface TypeScriptHandlerOptions {
  rootDirectory: string;
}

export interface ToolingHandlerOptions {
  toolingDirectory: string;
}

export interface GenerateImportMapOptions {
  rootDirectory: string;
  documentURL: string;
  html: string;
  target?: ECMAScriptTarget;
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

export async function generateImportMap({
  rootDirectory,
  documentURL,
  html,
  target = 2024,
}: GenerateImportMapOptions): Promise<Record<string, unknown>> {
  const root = resolve(rootDirectory);
  const packageJSONPath = resolve(root, 'package.json');
  const esmTarget = formatESMTarget(target);
  const source = await readFile(packageJSONPath, 'utf8');
  const packageJSON = JSON.parse(source) as {
    dependencies?: Record<string, string>;
  };
  const imports: Record<string, string> = {};

  for (const [name, version] of Object.entries(packageJSON.dependencies ?? {})) {
    const packageURL = `https://esm.sh/${packagePath(name)}@${encodeURIComponent(version)}`;

    imports[name] = `${packageURL}?target=${esmTarget}`;
    imports[`${name}/`] = `${packageURL}&target=${esmTarget}/`;
  }

  const existingImportMap = await readDocumentImportMap(
    root,
    documentURL,
    html,
  );

  return mergeImportMaps({ imports }, existingImportMap);
}

type ImportMap = Record<string, unknown>;

async function readDocumentImportMap(
  root: string,
  referer: string | undefined,
  providedHtml?: string,
): Promise<ImportMap> {
  const documentURL = getDocumentURL(referer);
  const documentPath = resolveProjectPath(root, documentURL.pathname, true);

  if (!documentPath) {
    return {};
  }

  const html = providedHtml ?? await readFile(documentPath, 'utf8').catch(
      (error: NodeJS.ErrnoException): null => {
        if (isMissingFileError(error)) return null;
        throw error;
      },
    );

  if (html === null) {
    return {};
  }

  const baseMatch = /<base\b([^>]*)>/i.exec(html);
  const baseHref = baseMatch
    ? getHtmlAttribute(baseMatch[1] ?? '', 'href')
    : undefined;
  const documentBaseURL = baseHref
    ? new URL(baseHref, documentURL)
    : documentURL;
  let importMap: ImportMap = {};

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1] ?? '';

    if (getHtmlAttribute(attributes, 'type')?.toLowerCase() !== 'importmap') {
      continue;
    }

    const source = getHtmlAttribute(attributes, 'src');
    let json = match[2] ?? '';
    let importMapBaseURL = documentBaseURL;

    if (source) {
      const sourceURL = new URL(source, documentBaseURL);

      if (sourceURL.origin !== documentURL.origin) {
        throw new Error(`Import map must be same-origin: ${sourceURL.href}`);
      }

      const sourcePath = resolveProjectPath(root, sourceURL.pathname, false);

      if (!sourcePath) {
        throw new Error(`Import map is outside the project root: ${sourceURL.pathname}`);
      }

      json = await readFile(sourcePath, 'utf8');
      importMapBaseURL = sourceURL;
    }

    if (json.trim()) {
      importMap = mergeImportMaps(
        importMap,
        normalizeImportMap(JSON.parse(json) as ImportMap, importMapBaseURL),
      );
    }
  }

  return importMap;
}

function normalizeImportMap(importMap: ImportMap, baseURL: URL): ImportMap {
  const result = { ...importMap };

  if (isRecord(importMap['imports'])) {
    result['imports'] = normalizeSpecifierMap(importMap['imports'], baseURL);
  }

  if (isRecord(importMap['scopes'])) {
    result['scopes'] = Object.fromEntries(
      Object.entries(importMap['scopes']).map(([scope, mappings]) => [
        normalizeURLLike(scope, baseURL),
        isRecord(mappings) ? normalizeSpecifierMap(mappings, baseURL) : mappings,
      ]),
    );
  }

  if (isRecord(importMap['integrity'])) {
    result['integrity'] = Object.fromEntries(
      Object.entries(importMap['integrity']).map(([url, integrity]) => [
        normalizeURLLike(url, baseURL),
        integrity,
      ]),
    );
  }

  return result;
}

function normalizeSpecifierMap(
  mappings: Record<string, unknown>,
  baseURL: URL,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(mappings).map(([specifier, address]) => [
      normalizeURLLike(specifier, baseURL),
      typeof address === 'string'
        ? normalizeURLLike(address, baseURL)
        : address,
    ]),
  );
}

function normalizeURLLike(value: string, baseURL: URL): string {
  return value.startsWith('./') || value.startsWith('../')
    ? new URL(value, baseURL).href
    : value;
}

function mergeImportMaps(base: ImportMap, override: ImportMap): ImportMap {
  const result: ImportMap = { ...base, ...override };

  for (const key of ['imports', 'integrity']) {
    if (isRecord(base[key]) || isRecord(override[key])) {
      result[key] = {
        ...(isRecord(base[key]) ? base[key] : {}),
        ...(isRecord(override[key]) ? override[key] : {}),
      };
    }
  }

  if (isRecord(base['scopes']) || isRecord(override['scopes'])) {
    const scopes: Record<string, unknown> = {
      ...(isRecord(base['scopes']) ? base['scopes'] : {}),
    };

    if (isRecord(override['scopes'])) {
      for (const [scope, mappings] of Object.entries(override['scopes'])) {
        scopes[scope] = {
          ...(isRecord(scopes[scope]) ? scopes[scope] : {}),
          ...(isRecord(mappings) ? mappings : {}),
        };
      }
    }

    result['scopes'] = scopes;
  }

  return result;
}

function getDocumentURL(referer: string | undefined): URL {
  if (!referer) return new URL('http://localhost/index.html');

  try {
    return new URL(referer);
  } catch {
    return new URL(referer, 'http://localhost');
  }
}

function resolveProjectPath(
  root: string,
  pathname: string,
  useIndexForDirectory: boolean,
): string | null {
  const path = useIndexForDirectory && pathname.endsWith('/')
    ? `${pathname}index.html`
    : pathname;

  return resolveRequestPath(root, path);
}

function getHtmlAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` +
      '`' +
      `]+))`,
    'i',
  ).exec(attributes);

  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
        mode: 'transform',
        sourceMap: true,
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

function packagePath(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

function formatESMTarget(target: ECMAScriptTarget): string {
  if (!Number.isInteger(target) || target < 2015 || target > 2024) {
    throw new RangeError(`Unsupported ECMAScript target: ${target}`);
  }

  return `es${target}`;
}

type ToolingFileName =
  | 'importmap.mts'
  | 'load-typescript.mts'
  | 'service-worker-loader.mts'
  | 'sw.mts';

const toolingFiles: ReadonlyMap<string, ToolingFileName> = new Map([
  ['/@es-server/importmap.mts', 'importmap.mts'],
  ['/@es-server/service-worker-loader.mts', 'service-worker-loader.mts'],
  ['/@es-server/sw.mts', 'sw.mts'],
]);

const defaultToolingDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tooling',
);

// Module service workers support static imports, but not dynamic import().
// @ts-expect-error TypeScript does not resolve browser-owned HTTPS modules.
import * as esbuildImport from 'https://esm.sh/esbuild-wasm@0.25.9/esm/browser.js';

type Loader = 'jsx' | 'ts' | 'tsx';

type EsbuildModule = {
  initialize(options: {
    wasmURL: string;
    worker: boolean;
  }): Promise<void>;
  transform(
    source: string,
    options: {
      loader: Loader;
      format: 'esm';
      target: 'es2024';
      jsx: 'automatic';
      jsxImportSource: 'react';
      sourcemap: 'inline';
      sourcefile: string;
      tsconfigRaw: {
        compilerOptions: {
          useDefineForClassFields: true;
          verbatimModuleSyntax: true;
        };
      };
    },
  ): Promise<{ code: string }>;
};

const esbuildWasmURL = 'https://esm.sh/esbuild-wasm@0.25.9/esbuild.wasm';
const esbuild = esbuildImport as EsbuildModule;
const serviceWorker = self as typeof self & ServiceWorkerGlobalScope;

let initializePromise: Promise<void> | undefined;

function ensureEsbuild(): Promise<void> {
  initializePromise ??= esbuild.initialize({
    wasmURL: esbuildWasmURL,
    worker: false
  });

  return initializePromise;
}

function loaderFromPath(pathname: string): Loader | null {
  if (pathname.endsWith('.tsx')) return 'tsx';
  if (pathname.endsWith('.mts')) return 'ts';
  if (pathname.endsWith('.ts')) return 'ts';
  if (pathname.endsWith('.jsx')) return 'jsx';
  return null;
}

serviceWorker.addEventListener('install', () => {
  void serviceWorker.skipWaiting();
});

serviceWorker.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(serviceWorker.clients.claim());
});

serviceWorker.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  const loader = loaderFromPath(url.pathname);

  if (
    !loader ||
    url.origin !== serviceWorker.location.origin ||
    url.pathname.startsWith('/@es-server/')
  ) {
    return;
  }

  event.respondWith(
    transformRequest(event.request, loader).catch((error: Error) =>
      transformErrorResponse(event.request, error)
    )
  );
});

function transformErrorResponse(request: Request, error: Error): Response {
  const message = error.message;
  const source = new URL(request.url).pathname;

  console.error(`Failed to transform ${source}:`, error);

  return new Response(
    `throw new Error(${JSON.stringify(`Failed to transform ${source}: ${message}`)});`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );
}

async function transformRequest(
  request: Request,
  loader: Loader,
): Promise<Response> {
  await ensureEsbuild();

  const sourceResponse = await fetch(request);

  if (!sourceResponse.ok) {
    return sourceResponse;
  }

  const source = await sourceResponse.text();

  const result = await esbuild.transform(source, {
    loader,
    format: 'esm',
    target: 'es2024',
    jsx: 'automatic',
    jsxImportSource: 'react',
    sourcemap: 'inline',
    sourcefile: new URL(request.url).pathname,
    tsconfigRaw: {
      compilerOptions: {
        useDefineForClassFields: true,
        verbatimModuleSyntax: true
      }
    }
  });

  return new Response(result.code, {
    status: 200,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

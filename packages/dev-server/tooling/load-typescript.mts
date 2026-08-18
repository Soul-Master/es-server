type ImportMap = {
  imports: Record<string, string>;
};

declare global {
  var importMapReady: Promise<ImportMap>;
}

const importMapURL = new URL('/@es-server/importmap.mts', location.origin);
const serviceWorkerLoaderURL = new URL(
  '/@es-server/service-worker-loader.mts',
  location.origin,
);

start().catch((error: Error) => {
  console.error(error);

  const root = document.getElementById('root');
  if (root) {
    root.textContent = String(error);
  }
});

async function start(): Promise<void> {
  await loadTypeScriptModule(importMapURL);
  await globalThis.importMapReady;
  await loadTypeScriptModule(serviceWorkerLoaderURL);
}

async function loadTypeScriptModule(url: URL): Promise<void> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'text/javascript',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not load ${url.pathname}: ${response.status} ${response.statusText}`,
    );
  }

  const moduleSource = await response.text();
  const moduleURL = URL.createObjectURL(
    new Blob([moduleSource], { type: 'text/javascript' }),
  );

  try {
    await import(moduleURL);
  } finally {
    URL.revokeObjectURL(moduleURL);
  }
}

export {};

type ImportMap = {
  imports: Record<string, string>;
};

const entryModuleURL = new URL('/src/main.tsx', location.origin).href;

declare global {
  var importMapReady: Promise<ImportMap>;
}

async function start(): Promise<void> {
  await globalThis.importMapReady;

  if (!('serviceWorker' in navigator)) {
    showError('Service Worker is not supported in this browser.');
    return;
  }

  await navigator.serviceWorker.register('/@es-server/sw.mts', {
    type: 'module',
    scope: '/',
  });

  await navigator.serviceWorker.ready;

  // A newly installed worker does not control the current page until reload.
  if (!navigator.serviceWorker.controller) {
    location.reload();
    return;
  }

  await import(entryModuleURL);
}

function showError(message: string): void {
  const root = document.getElementById('root');

  if (root) {
    root.textContent = message;
  }
}

start().catch((error: Error) => {
  console.error(error);
  showError(String(error));
});

export {};

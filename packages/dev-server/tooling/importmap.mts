type ImportMap = {
  imports: Record<string, string>;
};

type PackageJSON = {
  dependencies?: Record<string, string>;
};

declare global {
  var importMapReady: Promise<ImportMap>;
}

const packageJSONURL = '/package.json';
const cdnBaseURL = 'https://esm.sh/';

globalThis.importMapReady = createImportMap();

async function createImportMap(): Promise<ImportMap> {
  if (!HTMLScriptElement.supports?.('importmap')) {
    throw new Error('Import maps are not supported in this browser.');
  }

  const response = await fetch(packageJSONURL, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(
      `Could not load ${packageJSONURL}: ${response.status} ${response.statusText}`,
    );
  }

  const packageJSON = (await response.json()) as PackageJSON;
  const dependencies = packageJSON.dependencies ?? {};
  const imports: Record<string, string> = {};

  for (const [name, version] of Object.entries(dependencies)) {
    const packageURL = `${cdnBaseURL}${packagePath(name)}@${encodeURIComponent(version)}`;

    imports[name] = packageURL;
    imports[`${name}/`] = `${packageURL}/`;
  }

  const script = document.createElement('script');
  script.type = 'importmap';
  script.textContent = JSON.stringify({ imports });
  document.head.append(script);

  return { imports };
}

function packagePath(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

export {};

# ES Server

ES Server is a small ES development server for native browser modules. This
repository is an npm workspaces monorepo containing the server package and a
minimal React/TSX app at the root.

The server deliberately stays narrow: it serves static files and, when a
browser explicitly asks for JavaScript, strips erasable TypeScript syntax from
`.ts` and `.mts` files with Node.js. The React example demonstrates how a
Service Worker can add per-file TSX transformation without putting development
hooks in application source.

ES Server is not a bundler and does not implement HMR, dependency graphing,
production optimization, or framework-specific behavior.

## Workspaces

```text
es-server/
|-- packages/
|   |-- dev-server/         # Shared handlers, contracts, and browser tooling
|   |-- es-server/
|   |   `-- src/            # CLI
|   `-- koa/                # Koa server adapter and middleware
|-- src/                    # Minimal React/TSX demo app
|-- index.html              # Demo entry point
|-- package.json            # Workspace scripts and shared development tools
`-- package-lock.json
```

The package workspace exposes:

- `es-server` — starts the development server in the current directory
- `es-server <directory>` — serves a specific directory
- `@es-server/dev-server` — exports framework-neutral handlers and contracts
- `@es-server/koa` — exports the Koa server adapter
- `@es-server/koa/html-middleware` — injects import-map and browser tooling tags
- `@es-server/koa/middleware` — adapts any shared handler to Koa
- `@es-server/koa/source-file-middleware` — applies TypeScript and JavaScript source MIME types
- `@es-server/koa/typescript-middleware` — exports the Koa middleware

The server uses `127.0.0.1:8080` and ECMAScript target 2024 by default. Set
`HOST`, `PORT`, or `TARGET` to override these values. Programmatic server
options accept the target as a year, for example `{ target: 2022 }`.

## Requirements

- Node.js 22.13 or newer
- A browser with Service Worker and import map support for the React example

## Run the example

```bash
npm install
npm run serve
```

Then open <http://localhost:8080>.

To validate the example without emitting files:

```bash
npm run build
```

## How the example works

```text
       src/*.tsx
          |
          v
      ES Server
          |
          v
   Service Worker
  (esbuild-wasm transform)
          |
          v
 native browser ESM
```

Application code keeps normal imports such as `react` and
`react-dom/client`. The HTML middleware replaces existing import-map tags—or
injects tags after the document title—with a server-generated inline import
map and the Service Worker loader. The generated map combines dependencies
mapped to esm.sh with inline and local JSON import-map declarations; document
mappings take precedence. Local imports use explicit extensions so the browser
can resolve them without bundler-specific rules.

The browser runtime transforms one requested `.ts`, `.tsx`, or `.jsx` file at a
time. Module traversal remains the browser's responsibility. Inline source
maps preserve debugging against the original source files.

## Design boundaries

ES Server supports:

- static file serving
- opt-in `.ts` and `.mts` syntax stripping
- native browser ESM
- reusable server-agnostic request handlers
- a reusable Koa middleware export
- shared browser tooling served from `/@es-server/*`

The React example additionally demonstrates:

- `.tsx` and `.jsx` transformation in a Service Worker
- React's automatic JSX runtime
- dependency resolution through an import map and ESM CDN
- inline source maps

Production bundling is a separate concern. Use a production-oriented bundler
for tree shaking, minification, chunking, asset hashing, and deployment output.

## TypeScript request semantics

ES Server transforms a `.ts` or `.mts` request only when its sole accepted
media type is explicitly `text/javascript`. Requests with an absent, broad, or
different `Accept` header fall through to normal static serving. This keeps
transformation opt-in and lets browser-side tooling fetch untouched source when
needed.

Prefer explicit type-only imports and TypeScript settings compatible with
single-file transformation:

```json
{
  "compilerOptions": {
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

import { Readable } from 'node:stream';

import {
  generateImportMap,
  type ECMAScriptTarget,
} from '@es-server/dev-server';
import type { Middleware } from 'koa';

const serviceWorkerScript =
  '<script type="module" src="/@es-server/service-worker-loader.mts"></script>';

export interface HtmlMiddlewareOptions {
  rootDirectory: string;
  target?: ECMAScriptTarget;
}

/**
 * Rewrites import-map placeholders after downstream middleware has produced an
 * HTML response. Place this middleware before static/file-serving middleware.
 */
export function createHtmlMiddleware({
  rootDirectory,
  target,
}: HtmlMiddlewareOptions): Middleware {
  return async (ctx, next): Promise<void> => {
    await next();

    if (
      ctx.method === 'HEAD' ||
      ctx.status < 200 ||
      ctx.status >= 300 ||
      !ctx.response.is('html')
    ) {
      return;
    }

    const transformResponse = async (html: string): Promise<string> => {
      const importMap = await generateImportMap({
        rootDirectory,
        documentURL: ctx.href,
        html,
        ...(target === undefined ? {} : { target }),
      });

      return transformHtml(html, importMap);
    };

    if (typeof ctx.body === 'string') {
      ctx.body = await transformResponse(ctx.body);
      return;
    }

    if (Buffer.isBuffer(ctx.body)) {
      ctx.body = Buffer.from(await transformResponse(ctx.body.toString('utf8')));
      return;
    }

    if (ctx.body instanceof Readable) {
      const chunks: Buffer[] = [];

      for await (const chunk of ctx.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      ctx.body = Buffer.from(
        await transformResponse(Buffer.concat(chunks).toString('utf8')),
      );
    }
  };
}

export function transformHtml(
  html: string,
  importMap: Readonly<Record<string, unknown>>,
): string {
  let installedTooling = false;
  const importMapJSON = JSON.stringify(importMap).replaceAll('<', '\\u003c');
  const importMapScript = `<script type="importmap">${importMapJSON}</script>`;

  const transformedHtml = html.replace(
    /<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi,
    (script, attributes: string) => {
      if (getAttribute(attributes, 'type')?.toLowerCase() !== 'importmap') {
        return script;
      }

      const replacement = installedTooling
        ? ''
        : `${importMapScript}\n${serviceWorkerScript}`;

      installedTooling = true;
      return replacement;
    },
  );

  if (installedTooling) {
    return transformedHtml;
  }

  const tooling = `${importMapScript}\n${serviceWorkerScript}`;

  if (/<\/title\s*>/i.test(transformedHtml)) {
    return transformedHtml.replace(
      /<\/title\s*>/i,
      title => `${title}\n${tooling}`,
    );
  }

  if (/<head\b[^>]*>/i.test(transformedHtml)) {
    return transformedHtml.replace(
      /<head\b[^>]*>/i,
      head => `${head}\n${tooling}`,
    );
  }

  return `${tooling}\n${transformedHtml}`;
}

function getAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` +
      '`' +
      `]+))`,
    'i',
  ).exec(attributes);

  return match?.[1] ?? match?.[2] ?? match?.[3];
}

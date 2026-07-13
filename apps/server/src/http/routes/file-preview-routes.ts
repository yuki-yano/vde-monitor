import type { FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";

import { Hono } from "hono";

import {
  PREVIEW_RESOURCE_HEADERS,
  PreviewTicketService,
  buildPreviewContentSecurityPolicy,
  buildPreviewHtmlHeaders,
  isCssPreviewMimeType,
  isHtmlPreviewMimeType,
  resolvePreviewMimeType,
  transformPreviewCss,
  transformPreviewHtml,
} from "../../file-preview";

const MAX_TRANSFORM_SOURCE_BYTES = 4 * 1024 * 1024;

const notFound = () => new Response("Not Found", { status: 404 });

const isActiveDocumentMimeType = (mimeType: string) =>
  mimeType === "image/svg+xml" ||
  mimeType === "application/xml" ||
  mimeType === "application/xhtml+xml" ||
  mimeType.startsWith("text/xml");

const readTransformSource = async (fileHandle: FileHandle) => {
  const buffer = Buffer.allocUnsafe(MAX_TRANSFORM_SOURCE_BYTES + 1);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await fileHandle.read(buffer, offset, buffer.byteLength - offset, offset);
    if (bytesRead === 0) {
      break;
    }
    offset += bytesRead;
  }
  if (offset > MAX_TRANSFORM_SOURCE_BYTES) {
    throw new Error("preview transform source is too large");
  }
  return buffer.subarray(0, offset).toString("utf8");
};

const createHeaders = (
  mimeType: string,
  contentLength: number,
  isHtml: boolean,
  allowedFrameOrigins: readonly string[],
) => ({
  ...(isHtml ? buildPreviewHtmlHeaders(allowedFrameOrigins) : PREVIEW_RESOURCE_HEADERS),
  ...(isActiveDocumentMimeType(mimeType)
    ? { "Content-Security-Policy": buildPreviewContentSecurityPolicy(allowedFrameOrigins) }
    : {}),
  "Content-Disposition": "inline",
  "Content-Length": String(contentLength),
  "Content-Type": mimeType,
});

export const createFilePreviewRoutes = ({
  previewTicketService,
  allowedFrameOrigins = [],
}: {
  previewTicketService: PreviewTicketService;
  allowedFrameOrigins?: readonly string[];
}) =>
  new Hono().get("/:ticket/r/:rootId/:relativePath{.+}", async (c) => {
    try {
      const ticket = c.req.param("ticket");
      const rootId = c.req.param("rootId");
      const relativePath = c.req.param("relativePath");
      if (!ticket || !rootId || !relativePath) {
        return notFound();
      }
      const openedFile = await previewTicketService.open(ticket, rootId, relativePath);
      const mimeType = resolvePreviewMimeType(openedFile.absolutePath);
      const context = {
        authorizeResource: (dependencyRootId: string, dependencyRelativePath: string) => {
          try {
            previewTicketService.authorizeDependency(
              ticket,
              { rootId: openedFile.root.rootId, relativePath: openedFile.relativePath },
              { rootId: dependencyRootId, relativePath: dependencyRelativePath },
            );
            return true;
          } catch {
            return false;
          }
        },
        ticket,
        roots: openedFile.roots,
        resourceRootId: openedFile.root.rootId,
        resourceRelativePath: openedFile.relativePath,
      };

      let streamCreated = false;
      try {
        if (isHtmlPreviewMimeType(mimeType) || isCssPreviewMimeType(mimeType)) {
          if (openedFile.size > MAX_TRANSFORM_SOURCE_BYTES) {
            return notFound();
          }
          const source = await readTransformSource(openedFile.fileHandle);
          const transformed = isHtmlPreviewMimeType(mimeType)
            ? transformPreviewHtml(source, context)
            : transformPreviewCss(source, context);
          const body = Buffer.from(transformed);
          return new Response(body, {
            headers: createHeaders(
              mimeType,
              body.byteLength,
              isHtmlPreviewMimeType(mimeType),
              allowedFrameOrigins,
            ),
          });
        }

        const stream = openedFile.fileHandle.createReadStream({ autoClose: true });
        streamCreated = true;
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          headers: createHeaders(mimeType, openedFile.size, false, allowedFrameOrigins),
        });
      } finally {
        if (!streamCreated) {
          await openedFile.fileHandle.close();
        }
      }
    } catch {
      return notFound();
    }
  });

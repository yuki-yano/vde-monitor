import path from "node:path";

const mimeTypesByExtension: Readonly<Record<string, string>> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".cur": "image/x-icon",
  ".eot": "application/vnd.ms-fontobject",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".jxl": "image/jxl",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xhtml": "application/xhtml+xml",
  ".xml": "application/xml",
};

export const resolvePreviewMimeType = (filePath: string) =>
  mimeTypesByExtension[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

export const isHtmlPreviewMimeType = (mimeType: string) =>
  mimeType.startsWith("text/html") || mimeType === "application/xhtml+xml";

export const isCssPreviewMimeType = (mimeType: string) => mimeType.startsWith("text/css");

export const isImagePreviewMimeType = (mimeType: string) => mimeType.startsWith("image/");

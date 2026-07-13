const PREVIEW_CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'none'",
  "base-uri 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "sandbox",
];

const normalizeFrameAncestor = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
};

export const buildPreviewContentSecurityPolicy = (allowedFrameOrigins: readonly string[] = []) => {
  const frameAncestors = [
    "'self'",
    ...new Set(
      allowedFrameOrigins
        .map(normalizeFrameAncestor)
        .filter((origin): origin is string => origin != null),
    ),
  ];
  return [
    ...PREVIEW_CONTENT_SECURITY_POLICY_DIRECTIVES,
    `frame-ancestors ${frameAncestors.join(" ")}`,
  ].join("; ");
};

export const PREVIEW_CONTENT_SECURITY_POLICY = buildPreviewContentSecurityPolicy();

export const PREVIEW_RESOURCE_HEADERS = {
  "Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export const PREVIEW_HTML_HEADERS = {
  ...PREVIEW_RESOURCE_HEADERS,
  "Content-Security-Policy": PREVIEW_CONTENT_SECURITY_POLICY,
} as const;

export const buildPreviewHtmlHeaders = (allowedFrameOrigins: readonly string[]) => ({
  ...PREVIEW_RESOURCE_HEADERS,
  "Content-Security-Policy": buildPreviewContentSecurityPolicy(allowedFrameOrigins),
});

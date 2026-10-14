"use client";

import * as React from "react";

/**
 * Renders untrusted HTML email in a locked-down iframe.
 *
 * Defenses, in order:
 *  1. `sandbox` without `allow-scripts` — no script, inline handler, or
 *     javascript: URL can run. `allow-same-origin` is set ONLY so the parent
 *     can read the document height for auto-sizing; it is safe because the
 *     frame cannot execute script. Never add `allow-scripts` alongside it.
 *  2. A CSP <meta> with `default-src 'none'`: no remote images, fonts, CSS,
 *     frames, forms, or connections unless explicitly allowed.
 *  3. Remote images are blocked by default (tracking pixels); the caller opts in
 *     with `allowRemoteImages`.
 *  4. <script>, <base>, <object>/<embed>, and <meta http-equiv> are stripped
 *     before they reach the frame.
 */

export interface EmailFrameAttachment {
  /** Content-ID without angle brackets, as referenced by `cid:` in the HTML. */
  cid?: string | null;
  /**
   * Resolved URL for this attachment. Prefer `data:` or `blob:` URLs; an
   * https URL (e.g. a presigned S3 link) works too and its origin is added to
   * the frame's CSP `img-src`.
   */
  url?: string;
}

export interface EmailFrameProps {
  html: string;
  /** Inline attachments used to resolve `cid:` image references. */
  attachments?: EmailFrameAttachment[];
  /** Load images from the network. Default false. */
  allowRemoteImages?: boolean;
  /** Called once if the message contains remote images that were blocked. */
  onRemoteImagesBlocked?: (blocked: boolean) => void;
  className?: string;
}

const REMOTE_IMAGE = /(?:src|background)\s*=\s*["']?\s*(?:https?:)?\/\//i;
const REMOTE_CSS_URL = /url\(\s*["']?\s*(?:https?:)?\/\//i;

export function hasRemoteImages(html: string): boolean {
  return REMOTE_IMAGE.test(html) || REMOTE_CSS_URL.test(html);
}

function stripDangerous(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<(object|iframe)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(?:object|embed|iframe|base)\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildSrcDoc(
  html: string,
  attachments: EmailFrameAttachment[],
  allowRemoteImages: boolean,
): string {
  const cids = new Map<string, string>();
  const imgOrigins = new Set<string>();
  for (const a of attachments) {
    if (!a.cid || !a.url) continue;
    cids.set(a.cid.replace(/^<|>$/g, ""), a.url);
    const origin = originOf(a.url);
    if (origin) imgOrigins.add(origin);
  }

  const body = stripDangerous(html).replace(
    /cid:([^"'\s)>]+)/gi,
    (match, cid: string) => escapeAttr(cids.get(cid) ?? match),
  );

  const imgSrc = ["data:", "blob:", ...imgOrigins];
  if (allowRemoteImages) imgSrc.push("https:", "http:");

  const csp = [
    "default-src 'none'",
    `img-src ${imgSrc.join(" ")}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "form-action 'none'",
  ].join("; ");

  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#111;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
}

export function EmailFrame({
  html,
  attachments = [],
  allowRemoteImages = false,
  onRemoteImagesBlocked,
  className,
}: EmailFrameProps) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState(120);

  const srcDoc = React.useMemo(
    () => buildSrcDoc(html, attachments, allowRemoteImages),
    [html, attachments, allowRemoteImages],
  );

  React.useEffect(() => {
    onRemoteImagesBlocked?.(!allowRemoteImages && hasRemoteImages(html));
  }, [html, allowRemoteImages, onRemoteImagesBlocked]);

  const measure = React.useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.documentElement) return;
    setHeight(Math.ceil(doc.documentElement.scrollHeight));
  }, []);

  // Auto-size from the parent: the frame runs no script, so we observe its
  // document from here once it has loaded.
  const onLoad = React.useCallback(() => {
    measure();
    const doc = ref.current?.contentDocument;
    if (!doc?.documentElement) return;
    const observer = new ResizeObserver(measure);
    observer.observe(doc.documentElement);
    doc.querySelectorAll("img").forEach((img) => {
      img.addEventListener("load", measure);
    });
  }, [measure]);

  return (
    <iframe
      ref={ref}
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={onLoad}
      style={{ height }}
      className={`block w-full border-0 bg-white ${className ?? ""}`}
    />
  );
}

import { describe, expect, it } from "vitest";
import { buildSrcDoc, hasRemoteImages } from "./email-frame";

const html =
  '<p onclick="x()">hi</p><script>alert(1)</script><script src="//e.com/a.js"></script>' +
  '<base href="//evil"><meta http-equiv="refresh" content="0;url=//evil">' +
  '<object data="x"></object><iframe src="//evil"></iframe>' +
  '<img src="cid:logo"><img src="https://t.example/p.gif">';
const attachments = [
  { cid: "<logo>", url: "https://s3.example.com/x.png?sig=1" },
];

describe("buildSrcDoc (security boundary)", () => {
  const blocked = buildSrcDoc(html, attachments, false);

  it("strips scripts, meta refresh, base, object and iframe", () => {
    expect(blocked).not.toMatch(/<script/i);
    expect(blocked).not.toMatch(/http-equiv="refresh"/i);
    expect(blocked).not.toContain("//evil");
    expect(blocked).not.toMatch(/<(object|iframe)/i);
    expect(blocked.match(/<base/gi)).toHaveLength(1); // ours only
  });

  it("denies everything by default in the CSP", () => {
    expect(blocked).toContain("default-src 'none'");
    expect(blocked).toContain("form-action 'none'");
    expect(blocked).not.toMatch(/img-src[^;]*https?:(?!\/\/)/);
  });

  it("rewrites cid: and allows only that origin for images", () => {
    expect(blocked).toContain('src="https://s3.example.com/x.png?sig=1"');
    expect(blocked).toContain("img-src data: blob: https://s3.example.com;");
  });

  it("allows remote images only on opt-in", () => {
    expect(buildSrcDoc(html, attachments, true)).toMatch(
      /img-src[^;]*https: http:/,
    );
  });

  it("hides quoted history only when asked", () => {
    expect(blocked).not.toContain("gmail_quote");
    expect(buildSrcDoc("<p>x</p>", [], false, true)).toContain("gmail_quote");
  });
});

describe("hasRemoteImages", () => {
  it("detects remote src and css urls but not data: images", () => {
    expect(hasRemoteImages('<img src="https://a/b.png">')).toBe(true);
    expect(hasRemoteImages('<div style="background:url(//a/b.png)">')).toBe(
      true,
    );
    expect(hasRemoteImages('<img src="data:image/png;base64,AA">')).toBe(false);
  });
});

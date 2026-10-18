import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import handler, { isAllowedTemplateImageUrl } from "../api/template-image.js";
import { isCdnTemplateImageUrl } from "../src/hooks/useTemplateCanvasImage.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const catalog = JSON.parse(read("src/data/logolocalcdn.json"));
// Vite bundles JSON imports; inline that same catalog for the Node test runner.
const helperSource = read("src/utils/getCompanyLogo.js").replace(
  'import logoData from "../data/logolocalcdn.json";',
  `const logoData = ${JSON.stringify(catalog)};`,
);
const { getLocalLogo, getCompanyLogoUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
);

function mockResponse() {
  return {
    headers: {},
    statusCode: 0,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

const logoUrl = "https://cdn.mlmposter.com/companies/logos/example.webp";

test("bundled company logos keep both slots and sizes, and local assets resolve on nested routes", () => {
  let localCount = 0;
  for (const company of catalog) {
    const logos = getLocalLogo(company.ID);
    assert.equal(logos.length, company.logos.length);
    logos.forEach((logo, index) => {
      const original = company.logos[index];
      assert.equal(logo.size, original.size);
      if (original.link.startsWith("./companylogo/")) {
        localCount += 1;
        assert.equal(logo.link, original.link.slice(1));
        assert.equal(
          new URL(logo.link, "https://app.example/editor/preview").pathname,
          logo.link,
        );
        assert.ok(existsSync(new URL(`../public${logo.link}`, import.meta.url)));
      } else {
        assert.equal(logo.link, original.link);
      }
    });
  }
  assert.equal(localCount, 6);
  assert.equal(getLocalLogo("unknown-company"), null);
  assert.equal(getLocalLogo(null), null);
});

test("company image helper normalizes relative public logo fallbacks without rewriting CDN URLs", () => {
  assert.equal(getCompanyLogoUrl({ logoURL: " ./companylogo/awpl/awpl_rectangle.webp " }), "/companylogo/awpl/awpl_rectangle.webp");
  assert.equal(getCompanyLogoUrl({ logos: ["companylogo/Anvik/anvik_square.webp"] }), "/companylogo/Anvik/anvik_square.webp");
  assert.equal(getCompanyLogoUrl({ logos: [{ link: logoUrl }] }), logoUrl);
  assert.equal(getCompanyLogoUrl(null), "");
});

test("every remote catalog logo is eligible for the canvas and server fallback", () => {
  const remote = catalog.flatMap((company) => company.logos)
    .map((logo) => logo.link).filter((link) => link.startsWith("https://"));
  assert.ok(remote.length > 0);
  for (const link of remote) {
    assert.equal(isCdnTemplateImageUrl(link), true, link);
    assert.equal(isAllowedTemplateImageUrl(link), true, link);
  }
});

test("logo fallback stays limited to public raster images on the intended CDN", () => {
  for (const url of [
    "http://cdn.mlmposter.com/companies/logos/a.webp",
    "https://cdn.mlmposter.com.evil.test/companies/logos/a.webp",
    "https://other.example/companies/logos/a.webp",
    "https://user:pass@cdn.mlmposter.com/companies/logos/a.webp",
    "https://cdn.mlmposter.com:8443/companies/logos/a.webp",
    "https://cdn.mlmposter.com/companies/logos/a.svg",
    "https://cdn.mlmposter.com/companies/logos/a.json",
    "https://cdn.mlmposter.com/companies/private/a.webp",
    "https://cdn.mlmposter.com/companies/logos/../private/a.webp",
    "https://cdn.mlmposter.com/mlmprofiles/u/a.webp",
  ]) {
    assert.equal(isCdnTemplateImageUrl(url), false, url);
    assert.equal(isAllowedTemplateImageUrl(url), false, url);
  }
});

test("same-origin fallback serves the actual company-logo bytes with an image response", async (t) => {
  const bytes = readFileSync(new URL("../public/companylogo/awpl/awpl_rectangle.webp", import.meta.url));
  const upstream = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, logoUrl);
    assert.equal(options.redirect, "manual");
    return new Response(bytes, { headers: { "content-type": "image/webp" } });
  });
  const res = mockResponse();
  await handler({ method: "GET", query: { url: logoUrl } }, res);
  assert.equal(upstream.mock.callCount(), 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "image/webp");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.deepEqual(res.body, bytes);
});

test("unapproved logo requests are rejected without contacting upstream", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not fetch");
  });
  const res = mockResponse();
  await handler({ method: "GET", query: { url: "https://other.example/companies/logos/a.webp" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(upstream.mock.callCount(), 0);
});

test("logo fallback refuses redirects, non-image data and oversized files", async (t) => {
  const cases = [
    [new Response(null, { status: 302, headers: { location: "https://other.example/a.webp" } }), 502],
    [new Response("<html>error</html>", { headers: { "content-type": "text/html" } }), 415],
    [new Response("x", { headers: { "content-type": "image/webp", "content-length": String(5 * 1024 * 1024) } }), 413],
  ];
  let index = 0;
  t.mock.method(globalThis, "fetch", async () => cases[index++][0]);
  for (const [, expectedStatus] of cases) {
    const res = mockResponse();
    await handler({ method: "GET", query: { url: logoUrl } }, res);
    assert.equal(res.statusCode, expectedStatus);
  }
});

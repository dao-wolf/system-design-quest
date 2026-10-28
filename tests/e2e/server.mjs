// Serves the built element and the test page with a strict CSP, so every
// journey also proves the game runs without inline script, eval or inline styles.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = 4181;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
].join("; ");

// /types/ is a second host page. It loads the built element from /types/, so the element finds the fixture
// chapters.json beside it instead of the real one: one chapter for each challenge type, with known answers.
// /coach/ hosts the element without "static", so it looks for a local coach server; its tests answer for one.
const routes = {
  "/": "tests/e2e/fixtures/index.html",
  "/coach/": "tests/e2e/fixtures/coach.html",
  "/types/": "tests/e2e/fixtures/types.html",
  "/types/chapters.json": "tests/e2e/fixtures/chapters.json",
};
const fromDisk = (pathname) =>
  normalize(pathname)
    .replace(/^\/+/, "")
    .replace(/^types\//, "dist/");

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/health") return res.end("ok");
  const rel = routes[url.pathname] ?? fromDisk(url.pathname);
  if (!rel.startsWith("dist/") && !rel.startsWith("tests/e2e/fixtures/")) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, {
      "Content-Type": TYPES[extname(rel)] ?? "application/octet-stream",
      "Content-Security-Policy": CSP,
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, "127.0.0.1");

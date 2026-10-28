// Builds dist/: exactly what a release ships. element.js is one ES-module bundle of the element and everything it
// imports, with a linked source map. The element loads style.css and chapters.json (from the content gate) relative
// to its own URL, so they sit beside it. index.html is the standalone page.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

export const RELEASE_FILES = ["element.js", "element.js.map", "style.css", "chapters.json"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
await build({
  entryPoints: ["web/element.js"],
  outfile: "dist/element.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: "linked",
  logLevel: "warning",
});
for (const file of ["style.css", "index.html"]) copyFileSync(`web/${file}`, `dist/${file}`);
execFileSync("python3", ["tools/check_content.py", "content", "--out", "dist/chapters.json"], { stdio: "inherit" });

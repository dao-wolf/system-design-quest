// Builds dist/: the element's files, plus chapters.json from the content gate.
// Flat file names, exactly as a release ships them.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

export const RELEASE_FILES = ["element.js", "app.js", "engine.js", "style.css", "chapters.json"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const file of ["element.js", "app.js", "engine.js", "style.css", "index.html"])
  copyFileSync(`web/${file}`, `dist/${file}`);
execFileSync("python3", ["tools/check_content.py", "content", "--out", "dist/chapters.json"], { stdio: "inherit" });

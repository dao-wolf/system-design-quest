// Builds dist/: the element's files, plus chapters.json from the content gate.
// The same layout as web/, which the element loads as native ES modules.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";

export const RELEASE_FILES = ["element.js", "app.js", "engine.js", "style.css", "chapters.json"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
cpSync("web", "dist", { recursive: true });
execFileSync("python3", ["tools/check_content.py", "content", "--out", "dist/chapters.json"], { stdio: "inherit" });

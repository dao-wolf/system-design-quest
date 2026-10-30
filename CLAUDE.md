# CLAUDE.md

System Design Quest is a browser game for practising system design interviews. It is published to npm as `@daowolf/system-design-quest` and embedded on daowolf.com at `/projects/system-design-quest/`. How we work is in `CONTRIBUTING.md`, and the content rules are in `CONTENT.md`. Read them before changing either.

## Commands

- `pnpm check` runs everything CI runs: the content gate, lint, format check, tests (Node and Python), build and browser tests.
- `pnpm dev` builds and serves on port 4181. `pnpm mutate` runs mutation tests, and `pnpm docs` checks the prose with Vale.

## Rules

- **Sources:** every challenge's `source:` must match a prefix in `tools/sources.json`. `pnpm gate` fails otherwise.
- **Outside-in:** write a failing Playwright journey for the change first.
- **Playwright:**
  - `toHaveText` passes on a hidden element, so pair it with `toBeVisible`;
  - for visually hidden text, measure its width, because `toBeVisible` counts a 1px clip as visible (#4).
- **CI inputs:** a manual input that feeds a shell test such as `-gt` must be checked against a `case` pattern first. Otherwise a bad value falls through and the run goes green without doing what was asked (#4, `ci.yml`).
- **Browsers in cloud sessions:** Claude Code cloud sessions ship a Chromium that matches Playwright 1.56.1, and this repo uses 1.64.1. There, leave the browser tests to CI or install Chromium first. Upgrade Playwright in its own PR.

## Releases (Oleg approves each one)

- **Tags:** pushing a `v*` tag builds the package, stages the npm publish and drafts the GitHub release. Releases are immutable, so never push a tag without Oleg's go in this session.
- **npm approval:** Oleg approves the staged publish on npm.
- **README snippet:** move its CDN or install line to the new version only after that approval, in its own PR. Before then the link returns 404.
- **Version bumps** get their own PR.

# System Design Quest

Practise system design interviews as a game. Training chapters build the
knowledge; quests are katas where you design one product end to end.

**Try it:** [daowolf.com/system-design-quest](https://daowolf.com/system-design-quest)

## What you get

- **Training:** eight chapters, from the interview method to core concepts,
  key technologies and patterns. They open in order, or jump into any of them.
- **Quests:** design a URL shortener, a rate limiter, file storage and sync,
  nearby places and ride booking. Every quest is open from the start.
- **Eleven kinds of challenge:** trade-off duels, filling and labelling
  diagrams, spotting the flaw, estimates, written answers, lightning rounds,
  timed sprints and more.
- **Points for right answers only.** A miss costs nothing and comes back later.
- **An optional profile:** add who you're interviewing with and when, for a
  countdown. Leave it empty and the game works the same.
- No account, no adverts, and nothing you type leaves your browser.

## Use it on your own page

```html
<script type="module" src="element.js"></script>
<system-design-quest static></system-design-quest>
```

Keep `style.css` and `chapters.json` next to the script (and
`element.js.map`, if you want source maps). Add `theme="dark"` or
`theme="light"` to override the visitor's setting. If your page has a fixed
header, set `--sticky-top` to its height (for example
`:root { --sticky-top: 56px; }`) and the game's top bar sticks below it.

Get the files one of two ways:

- **npm:** `npm install @daowolf/system-design-quest`, then copy
  `node_modules/@daowolf/system-design-quest/dist/` into your site at build
  time. npm shows which commit and workflow built each version (provenance).
- **A [release](https://github.com/dao-wolf/system-design-quest/releases):**
  GitHub signs each one, so you can check where it came from.

## Develop

You need Node 22 or later, pnpm 10 and Python 3.10 or later.

```sh
pnpm install
python3 -m pip install -r requirements.txt
pnpm dev     # local page on port 4181
pnpm check   # everything CI runs
```

## How it's tested

- **Journeys:** Playwright plays the built game on a host page, under a strict
  security policy, with axe checking accessibility.
- **Logic:** unit tests on the scoring engine and the content gate.
- **Content gate:** a script checks every challenge against its schema, length
  limits and an allowlist of sources before it can ship.
- **Mutation testing:** Stryker changes the scoring engine on purpose; the
  tests must notice.
- **Security:** lint rules, dependency checks and code scanning.

## Licence

Code: [MIT](LICENSE). Challenges: [CC BY 4.0](content/LICENSE.md).

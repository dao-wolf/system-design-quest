# Writing challenges for System Design Quest

Every chapter is one YAML file in `content/`. `tools/check_content.py` is the gate: nothing reaches the game unless it passes. Run it after every edit:

```bash
python3 tools/check_content.py content
```

## Rules for the words

- **Original wording only.** Use public sources for facts, never their text. No sentence copied from any course, book or site.
- **Bite-sized.** Prompts under 300 characters, answers under 240, options under 90, explanations under 400.
- **Teach the move, not a memorised design.** Trade-offs, "when you hear X, reach for Y", what it costs, what breaks first.
- **Every explanation says what, why and the fix**, about the work, never the person: "Polling every second at this scale wastes requests. Server-sent events push only when something changes. Say: 'One-way updates, so SSE.'"
- **Plain English first;** expand an abbreviation the first time a chapter uses it.
- **British English.**

## Chapter file

```yaml
chapter: 3 # number, unique
slug: apis # unique, a-z and hyphens
title: APIs and live updates
emoji: "🔌"
pillar: Core concepts # The interview | Core concepts | Key technologies | Patterns
blurb: One line on what this chapter trains.
boss: api-boss # id of the challenge that is the chapter's boss
challenges:
  - id: api-01 # unique across every file: a-z, 0-9, hyphens
    type: duel # see the types below
    bloom: evaluate # remember | understand | apply | analyse | evaluate | create
    prompt: ...
    explain: ... # shown after answering: what, why, the fix
    source: https://... # a public page that backs the facts (allowlisted prefixes in tools/sources.json)
```

**Two kinds of file.** _Training_ chapters (the default) build knowledge, one topic each, and unlock in order. _Quests_ are katas: design one product end to end. A quest file adds `kind: quest`, `pillar: Quests` and `builds_on` (the training chapter numbers it leans on), is open from the start, and follows the URL shortener's shape: a requirements sprint, an estimate, entities and API, fill the diagram, two deep dives, then the product's crux as the boss. Name quests plainly, the familiar product in brackets: `Ride booking (like Uber)`. Training files are `chN-slug.yaml`, quests `qN-slug.yaml`.

**No dates.** Training chapters unlock by progress: two chapters open at the start, then one more for each boss beaten. The gate rejects date fields such as `sealed_until`. New content ships when it's ready.

The boss is one of the chapter's challenges, often a harder one of any type. List it last.

**Overlays** (`--overlay DIR`) add a player's own challenges to a core chapter: `extends_chapter`, optional `insert_after` and `boss`, and optional `for_company` (a name or a list), which joins only while the player's profile names that company.

## Types

| Type        | Extra fields                                                                                                   | Scored                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `recall`    | `answer`                                                                                                       | Self-graded: again 0, hard ½, good 1, easy 1           |
| `multi`     | `options` (3–8, more than 1.5 times as many as `correct`), `correct` (list of 0-based indices)                 | Right picks minus wrong picks, over the number correct |
| `duel`      | `choices` (2–4), `correct` (index); `reasons` (3–5), `reason` (index); `costs` (3–5), `cost` (index)           | One third each for choice, reason and cost             |
| `write`     | `key_points` (2–6), optional `model` (a model answer under 500 characters)                                     | Self-graded: key points ticked over key points         |
| `estimate`  | `generator` with `kind` and its `params` (see below)                                                           | Within the tolerance of the worked answer              |
| `fill`      | `diagram`, `slots` (node id → the right label), `palette` (labels, including every right one plus distractors) | Right slots over slots                                 |
| `sticker`   | `diagram`, `stickers` (labels), `answers` (node id → list of stickers it needs; nodes left out need none)      | Right placements minus wrong ones, over the right ones |
| `flaw`      | `diagram`, `flaw` (the weak node's id), `fixes` (3–5), `fix` (index)                                           | Half for the node, half for the fix                    |
| `order`     | `items`, in the right order (3–8); the game shuffles them                                                      | Items in the right place over items                    |
| `lightning` | `pairs` (6 or more `[when you hear, reach for]`), optional `seconds` (default 90)                              | Right answers over pairs shown                         |
| `sprint`    | `minutes`, `checks` (3–8 things to tick after)                                                                 | Self-graded: checks ticked over checks                 |

### Diagrams

```yaml
diagram:
  width: 640 # optional, default 640
  height: 300 # optional, default 300
  nodes:
    - { id: client, label: Client, x: 20, y: 120 }
    - { id: lb, label: Load balancer, x: 170, y: 120 }
    - { id: s1, label: "?", x: 320, y: 120 } # a slot: its label is ignored
  edges:
    - [client, lb]
    - [lb, s1, reads] # optional third item: a label on the arrow
```

Nodes are 120 × 48 by default (`w`, `h` to change). Keep every node inside the width and height.

### Estimate generators

| `kind`         | `params`                                             | Asks                                                                                           |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `peak_rps`     | `users` [min, max], `actions` [min, max]             | Users × actions a day → requests a second at the peak (÷ 100,000, × 10)                        |
| `storage_year` | `items` [min, max] a day, `kb` [min, max] each       | Storage a year, in GB or TB                                                                    |
| `shard_or_not` | `users` [min, max], `writes` [min, max] a user a day | Peak writes a second, and whether one database copes (split past about 10,000 writes a second) |
| `bandwidth`    | `rps` [min, max], `kb` [min, max] a response         | Outbound bandwidth in MB a second                                                              |

Answers count within a factor of 1.6 either way: interview maths is about the rough size.

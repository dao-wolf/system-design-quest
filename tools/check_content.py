#!/usr/bin/env python3
"""check_content.py - the content gate for System Design Quest.

Nothing reaches the game unless it passes. Checks every chapter file against
the rules in CONTENT.md: schema per challenge type, unique ids, bite-sized text,
indices in range, diagrams that hang together, sources from the allowlist, and
no dates: content unlocks by progress, never on a date.

Optional, for a player's own copy:
  --overlay DIR   personal challenges merged into chapters; an overlay naming
                  'for_company' joins only while the profile names that company
  --holds FILE    hold-backs for mocks (hashed words). While one is active, any
                  challenge with a held word is left out, and a chapter whose
                  boss or title is held is left out whole. Words are never printed.
  --profile FILE  the player's profile: company, interview date, and when each
                  hold-back lifts (the player decides, in the game)

Deterministic: no network, no model. Exit 0 = clean, 2 = violations.

Usage:
  check_content.py CONTENT_DIR [--overlay DIR] [--holds FILE] [--profile FILE]
                   [--today YYYY-MM-DD] [--vault DIR] [--out bundle.json]
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))

TYPES = {"recall", "multi", "duel", "write", "estimate", "fill", "sticker",
         "flaw", "order", "lightning", "sprint"}
BLOOMS = ["remember", "understand", "apply", "analyse", "evaluate", "create"]
PILLARS = {"The interview", "Core concepts", "Key technologies", "Patterns", "Quests"}
KINDS = {"training", "quest"}
GENERATORS = {"peak_rps": ("users", "actions"), "storage_year": ("items", "kb"),
              "shard_or_not": ("users", "writes"), "bandwidth": ("rps", "kb")}
LIMITS = {"prompt": 300, "explain": 400, "answer": 240, "model": 500,
          "option": 90, "blurb": 160, "title": 40}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DEFAULT_W, DEFAULT_H, NODE_W, NODE_H = 640, 300, 120, 48


class Report:
    def __init__(self):
        self.errors = []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")


def load_sources():
    with open(os.path.join(HERE, "sources.json"), encoding="utf-8") as f:
        return json.load(f)["prefixes"]


def vault_ref_ok(ref, vault):
    """'Note name#Heading' must name a note in the vault and, if given, a heading in it."""
    note, _, heading = ref.partition("#")
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        if note + ".md" in files:
            if not heading:
                return True
            with open(os.path.join(root, note + ".md"), encoding="utf-8") as f:
                heads = [re.sub(r"^#+\s*", "", l).strip() for l in f if l.startswith("#")]
            return heading.strip() in heads
    return False


def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings(v)


def word_hash(word):
    return hashlib.sha256(word.lower().encode()).hexdigest()


def word_hashes(obj):
    """The hash of every lower-case word in the object's text."""
    return {word_hash(w) for s in strings(obj) for w in re.findall(r"[a-z]+", s.lower())}


def is_date(s):
    try:
        dt.date.fromisoformat(str(s))
        return True
    except ValueError:
        return False


def hold_active(hold_id, profile, today):
    """The same rule as holdActive in engine.js: lifted by hand, on its own date, else the day after the interview.
    With none of those, it stays until the player lifts it."""
    profile = profile if isinstance(profile, dict) else {}
    h = (profile.get("holds") or {}).get(hold_id) or {}
    if h.get("lifted") is True:
        return False
    if is_date(h.get("lifts")):
        return today < str(h["lifts"])
    if is_date(profile.get("interview_date")):
        return today <= str(profile["interview_date"])
    return True


def held_hashes(holds_doc, profile, today):
    """The hashed words of every hold-back still active today."""
    out = set()
    for h in (holds_doc or {}).get("holds", []):
        if isinstance(h, dict) and isinstance(h.get("id"), str) and hold_active(h["id"], profile, today):
            out |= set(h.get("hashes", []))
    return out


def for_this_player(overlay, company):
    """An overlay without 'for_company' is for everyone; one with it joins only while the profile names that company."""
    want = overlay.get("for_company")
    if want is None:
        return True
    names = [want] if isinstance(want, str) else want if isinstance(want, list) else []
    have = (company or "").strip().lower()
    return bool(have) and any(isinstance(n, str) and n.strip().lower() == have for n in names)


def check_len(rep, where, field, value, limit):
    if not isinstance(value, str) or not value.strip():
        rep.err(where, f"'{field}' must be non-empty text")
    elif len(value) > limit:
        rep.err(where, f"'{field}' is {len(value)} characters (limit {limit})")


def check_list(rep, where, field, value, lo, hi, item_limit=LIMITS["option"]):
    if not isinstance(value, list) or not (lo <= len(value) <= hi):
        rep.err(where, f"'{field}' must be a list of {lo}-{hi} items")
        return False
    for i, v in enumerate(value):
        check_len(rep, where, f"{field}[{i}]", v, item_limit)
    if len(set(value)) != len(value):
        rep.err(where, f"'{field}' has duplicates")
    return True


def check_index(rep, where, field, value, n):
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < n:
        rep.err(where, f"'{field}' must be an index from 0 to {n - 1}")


def check_diagram(rep, where, d):
    if not isinstance(d, dict) or not isinstance(d.get("nodes"), list) or not d["nodes"]:
        rep.err(where, "'diagram' needs a list of nodes")
        return set()
    w, h = d.get("width", DEFAULT_W), d.get("height", DEFAULT_H)
    ids = set()
    for n in d["nodes"]:
        nid = n.get("id")
        if not isinstance(nid, str) or not ID_RE.match(nid) or nid in ids:
            rep.err(where, f"node id {nid!r} is missing, malformed or repeated")
            continue
        ids.add(nid)
        check_len(rep, where, f"node {nid} label", str(n.get("label", "")), 40)
        x, y = n.get("x"), n.get("y")
        nw, nh = n.get("w", NODE_W), n.get("h", NODE_H)
        if not all(isinstance(v, (int, float)) for v in (x, y, nw, nh)):
            rep.err(where, f"node {nid} needs numeric x and y")
        elif x < 0 or y < 0 or x + nw > w or y + nh > h:
            rep.err(where, f"node {nid} falls outside the {w}x{h} diagram")
    boxes = [(n["id"], n["x"], n["y"], n["x"] + n.get("w", NODE_W), n["y"] + n.get("h", NODE_H))
             for n in d["nodes"] if all(isinstance(n.get(k), (int, float)) for k in ("x", "y"))]
    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            gap = 4  # boxes closer than this look joined
            if not (a[3] + gap <= b[1] or b[3] + gap <= a[1] or a[4] + gap <= b[2] or b[4] + gap <= a[2]):
                rep.err(where, f"nodes {a[0]} and {b[0]} overlap or touch")
    for e in d.get("edges", []):
        if not isinstance(e, list) or len(e) not in (2, 3) or e[0] not in ids or e[1] not in ids:
            rep.err(where, f"edge {e!r} must join two node ids")
    return ids


def check_challenge(rep, c, ch_where, prefixes, vault, allow_vault):
    cid = c.get("id", "?")
    where = f"{ch_where} / {cid}"
    t = c.get("type")
    if t not in TYPES:
        rep.err(where, f"unknown type {t!r}")
        return
    if c.get("bloom") not in BLOOMS:
        rep.err(where, f"'bloom' must be one of {BLOOMS}")
    check_len(rep, where, "prompt", c.get("prompt"), LIMITS["prompt"])
    check_len(rep, where, "explain", c.get("explain"), LIMITS["explain"])
    if isinstance(c.get("prompt"), str) and c["prompt"].lower().startswith("boss"):
        rep.err(where, "don't start a prompt with 'Boss': the game labels the boss itself")
    src = c.get("source")
    if not isinstance(src, str) or not src:
        rep.err(where, "'source' is required")
    elif src.startswith("vault:"):
        if not allow_vault:
            rep.err(where, "vault sources are allowed only in a personal overlay")
        elif vault and not vault_ref_ok(src[6:].strip(), vault):
            rep.err(where, f"vault source not found: {src}")
    elif not any(src.startswith(p) for p in prefixes):
        rep.err(where, f"source not on the allowlist: {src}")
    if "seconds" in c and (not isinstance(c["seconds"], int) or not 10 <= c["seconds"] <= 600):
        rep.err(where, "'seconds' must be 10-600")
    if "sealed_until" in c:
        rep.err(where, "'sealed_until' isn't allowed: content carries no dates and unlocks by progress")

    if t == "recall":
        check_len(rep, where, "answer", c.get("answer"), LIMITS["answer"])
    elif t == "multi":
        if check_list(rep, where, "options", c.get("options"), 3, 8):
            n = len(c["options"])
            corr = c.get("correct")
            if not isinstance(corr, list) or not corr:
                rep.err(where, "'correct' must be a non-empty list of indices")
            else:
                for i in corr:
                    check_index(rep, where, "correct", i, n)
                if len(set(corr)) != len(corr) or len(corr) >= n:
                    rep.err(where, "'correct' must be distinct and leave at least one wrong option")
                if n <= 1.5 * len(corr):
                    rep.err(where, f"{n} options for {len(corr)} right is too few: ticking everything would score "
                                   "half or more, so it needs more than 1.5 times as many options as right ones "
                                   "(at most 8 options, so at most 5 right)")
    elif t == "duel":
        for field, idx, lo, hi in (("choices", "correct", 2, 4), ("reasons", "reason", 3, 5),
                                   ("costs", "cost", 3, 5)):
            if check_list(rep, where, field, c.get(field), lo, hi):
                check_index(rep, where, idx, c.get(idx), len(c[field]))
    elif t == "write":
        check_list(rep, where, "key_points", c.get("key_points"), 2, 6, 140)
        if "model" in c:
            check_len(rep, where, "model", c["model"], LIMITS["model"])
    elif t == "estimate":
        g = c.get("generator") or {}
        kind = g.get("kind")
        if kind not in GENERATORS:
            rep.err(where, f"generator kind must be one of {sorted(GENERATORS)}")
        else:
            for p in GENERATORS[kind]:
                r = (g.get("params") or {}).get(p)
                if not (isinstance(r, list) and len(r) == 2 and all(isinstance(v, (int, float)) for v in r)
                        and 0 < r[0] <= r[1]):
                    rep.err(where, f"generator param '{p}' must be [min, max] with 0 < min <= max")
    elif t in ("fill", "sticker", "flaw"):
        ids = check_diagram(rep, where, c.get("diagram"))
        if t == "fill":
            slots = c.get("slots") or {}
            pal = c.get("palette") or []
            if not slots or not isinstance(slots, dict):
                rep.err(where, "'slots' must map node ids to labels")
            check_list(rep, where, "palette", pal, 2, 12, 40)
            for nid, lab in slots.items():
                if nid not in ids:
                    rep.err(where, f"slot {nid} is not a node")
                if lab not in pal:
                    rep.err(where, f"slot answer {lab!r} is missing from the palette")
            if isinstance(pal, list) and len(pal) <= len(slots):
                rep.err(where, "'palette' needs at least one distractor")
        elif t == "sticker":
            st = c.get("stickers") or []
            check_list(rep, where, "stickers", st, 2, 8, 40)
            ans = c.get("answers") or {}
            if not ans or not isinstance(ans, dict):
                rep.err(where, "'answers' must map node ids to sticker lists")
            for nid, lst in ans.items():
                if nid not in ids:
                    rep.err(where, f"answer node {nid} is not a node")
                if not isinstance(lst, list) or not lst or any(s not in st for s in lst):
                    rep.err(where, f"answers for {nid} must list stickers from 'stickers'")
        else:
            if c.get("flaw") not in ids:
                rep.err(where, "'flaw' must be a node id")
            if check_list(rep, where, "fixes", c.get("fixes"), 3, 5, 140):
                check_index(rep, where, "fix", c.get("fix"), len(c["fixes"]))
    elif t == "order":
        check_list(rep, where, "items", c.get("items"), 3, 8)
    elif t == "lightning":
        pairs = c.get("pairs")
        if not isinstance(pairs, list) or len(pairs) < 6:
            rep.err(where, "'pairs' needs 6 or more [hear, reach] pairs")
        else:
            for p in pairs:
                if not (isinstance(p, list) and len(p) == 2):
                    rep.err(where, f"pair {p!r} must be [hear, reach]")
                else:
                    check_len(rep, where, "pair", p[0], 90)
                    check_len(rep, where, "pair", p[1], 60)
            if len({p[1] for p in pairs if isinstance(p, list) and len(p) == 2}) < 4:
                rep.err(where, "lightning needs at least 4 different answers")
    elif t == "sprint":
        if not isinstance(c.get("minutes"), int) or not 1 <= c["minutes"] <= 50:
            rep.err(where, "'minutes' must be 1-50")
        check_list(rep, where, "checks", c.get("checks"), 3, 8, 140)


def load_dir(path, rep):
    out = []
    if not path or not os.path.isdir(path):
        return out
    for fn in sorted(os.listdir(path)):
        if fn.endswith((".yaml", ".yml")):
            fp = os.path.join(path, fn)
            try:
                with open(fp, encoding="utf-8") as f:
                    out.append((fn, yaml.safe_load(f)))
            except yaml.YAMLError as e:
                rep.err(fn, f"YAML does not parse: {e}")
    return out


def check_chapter(rep, fn, doc, prefixes, vault, allow_vault, seen_ids):
    where = fn
    if not isinstance(doc, dict):
        rep.err(where, "not a mapping")
        return
    if not isinstance(doc.get("chapter"), int):
        rep.err(where, "'chapter' must be a number")
    if not isinstance(doc.get("slug"), str) or not ID_RE.match(doc["slug"]):
        rep.err(where, "'slug' must be lower-case words joined by hyphens")
    check_len(rep, where, "title", doc.get("title"), LIMITS["title"])
    check_len(rep, where, "blurb", doc.get("blurb"), LIMITS["blurb"])
    if doc.get("pillar") not in PILLARS:
        rep.err(where, f"'pillar' must be one of {sorted(PILLARS)}")
    if "open" in doc and not isinstance(doc["open"], bool):
        rep.err(where, "'open' must be true or false")
    kind = doc.get("kind", "training")
    if kind not in KINDS:
        rep.err(where, f"'kind' must be one of {sorted(KINDS)}")
    if kind == "quest":
        if doc.get("pillar") != "Quests":
            rep.err(where, "a quest's pillar must be 'Quests'")
        b = doc.get("builds_on")
        if not isinstance(b, list) or not b or not all(isinstance(n, int) and not isinstance(n, bool) for n in b):
            rep.err(where, "a quest needs 'builds_on': a list of training chapter numbers")
    elif doc.get("pillar") == "Quests" or "builds_on" in doc:
        rep.err(where, "only a quest (kind: quest) takes the 'Quests' pillar or 'builds_on'")
    chs = doc.get("challenges")
    if not isinstance(chs, list) or not chs:
        rep.err(where, "'challenges' must be a non-empty list")
        return
    for c in chs:
        cid = c.get("id") if isinstance(c, dict) else None
        if not isinstance(cid, str) or not ID_RE.match(cid):
            rep.err(where, f"challenge id {cid!r} is malformed")
            continue
        if cid in seen_ids:
            rep.err(where, f"challenge id {cid} is used twice")
        seen_ids.add(cid)
        check_challenge(rep, c, where, prefixes, vault, allow_vault)
    if doc.get("boss") not in {c.get("id") for c in chs if isinstance(c, dict)}:
        rep.err(where, "'boss' must be the id of one of the chapter's challenges")


def build(content_dir, overlay_dir=None, held=frozenset(), today=None, vault=None, company=None, notes=None):
    """Check everything; return (bundle, errors). The bundle merges overlay challenges into chapters.
    held: hashed words of the active hold-backs. company: the profile's, for overlays that name one.
    notes: a list to receive one-line summaries (never a held word)."""
    rep = Report()
    prefixes = load_sources()
    today = today or dt.date.today().isoformat()
    notes = notes if notes is not None else []
    seen = set()
    core = load_dir(content_dir, rep)
    chapters = {}
    for fn, doc in core:
        check_chapter(rep, fn, doc, prefixes, vault, False, seen)
        if isinstance(doc, dict) and isinstance(doc.get("chapter"), int):
            if doc["chapter"] in chapters:
                rep.err(fn, f"chapter {doc['chapter']} appears twice")
            chapters[doc["chapter"]] = doc
    training = {n for n, d in chapters.items() if d.get("kind", "training") == "training"}
    for n, d in chapters.items():
        builds_on = d.get("builds_on") if d.get("kind") == "quest" else None
        for b in builds_on if isinstance(builds_on, list) else []:
            if b not in training:
                rep.err(f"chapter {n}", f"'builds_on' names {b!r}, which isn't a training chapter")
    for fn, doc in load_dir(overlay_dir, rep):
        if not isinstance(doc, dict) or doc.get("extends_chapter") not in chapters:
            rep.err(fn, "an overlay needs 'extends_chapter' naming a core chapter")
            continue
        extra = doc.get("challenges") or []
        for c in extra:
            cid = c.get("id") if isinstance(c, dict) else None
            if not isinstance(cid, str) or not ID_RE.match(cid) or cid in seen:
                rep.err(fn, f"overlay challenge id {cid!r} is malformed or repeated")
                continue
            seen.add(cid)
            check_challenge(rep, c, fn, prefixes, vault, True)
        if "boss" in doc and doc["boss"] not in {c.get("id") for c in extra if isinstance(c, dict)}:
            rep.err(fn, "an overlay 'boss' must be one of the overlay's own challenges")
        if not for_this_player(doc, company):
            notes.append(f"⏭️  {fn}: left out (it's for another company)")
            continue
        notes.append(f"➕ {fn}: included")
        target = chapters[doc["extends_chapter"]]
        pos = doc.get("insert_after")
        ids = [c["id"] for c in target["challenges"]]
        at = ids.index(pos) + 1 if pos in ids else len([c for c in target["challenges"] if c["id"] != target["boss"]])
        target["challenges"] = target["challenges"][:at] + extra + target["challenges"][at:]
        if "boss" in doc and doc["boss"] in {c.get("id") for c in extra if isinstance(c, dict)}:
            target["boss"] = doc["boss"]
    bundle_chapters = []
    held_challenges = held_chapters = 0
    for num in sorted(chapters):
        doc = chapters[num]
        challenges = doc.get("challenges") or []
        live = [c for c in challenges if not (held and word_hashes(c) & held)]
        meta_held = bool(held) and bool(word_hashes({k: v for k, v in doc.items() if k != "challenges"}) & held)
        boss = doc.get("boss")
        boss_held = (boss in {c.get("id") for c in challenges if isinstance(c, dict)}
                     and boss not in {c.get("id") for c in live if isinstance(c, dict)})
        if meta_held or boss_held:  # a chapter can't run without its boss, so it waits whole
            held_chapters += 1
            held_challenges += len(challenges)
            continue
        held_challenges += len(challenges) - len(live)
        bundle_chapters.append({**doc, "challenges": live})
    bundle = {"version": 1, "built": today, "chapters": bundle_chapters}
    if held_challenges or held_chapters:
        bundle["held"] = {"challenges": held_challenges, "chapters": held_chapters}
        notes.append(f"🔒 hold-backs: {held_challenges} challenge(s) left out, {held_chapters} of them as whole chapters (words hidden)")
    return bundle, rep.errors


def read_json(path, default):
    if not path or not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("content")
    ap.add_argument("--overlay")
    ap.add_argument("--holds")
    ap.add_argument("--profile")
    ap.add_argument("--today")
    ap.add_argument("--vault")
    ap.add_argument("--out")
    a = ap.parse_args()
    today = a.today or dt.date.today().isoformat()
    profile = read_json(a.profile, {})
    profile = profile if isinstance(profile, dict) else {}
    held = held_hashes(read_json(a.holds, {}), profile, today)
    notes = []
    bundle, errors = build(a.content, a.overlay, held, today, a.vault, profile.get("company"), notes)
    n = sum(len(c["challenges"]) for c in bundle["chapters"])
    if errors:
        print(f"🔴 content gate: {len(errors)} problem(s)")
        for e in errors:
            print("  -", e)
        sys.exit(2)
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False, indent=1)
    print(f"🟢 content gate: {len(bundle['chapters'])} chapter(s), {n} challenge(s)"
          + (f" → {a.out}" if a.out else ""))
    for note in notes:
        print("  " + note)


if __name__ == "__main__":
    main()

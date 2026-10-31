"""Tests for the content gate. Run from game/: python3 -m unittest discover -s tests -p 'test_*.py'"""
import os
import sys
import tempfile
import unittest

import yaml

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import check_content  # noqa: E402

SRC = "https://www.hellointerview.com/learn/system-design/in-a-hurry/delivery"


def chapter(challenges, boss=None, **extra):
    return {"chapter": 1, "slug": "one", "title": "One", "emoji": "x", "pillar": "Core concepts",
            "blurb": "A chapter.", "boss": boss or challenges[-1]["id"], "challenges": challenges, **extra}


def recall(cid, **extra):
    return {"id": cid, "type": "recall", "bloom": "remember", "prompt": "What is it?", "answer": "This.",
            "explain": "Because.", "source": SRC, **extra}


class Gate(unittest.TestCase):
    def run_gate(self, docs, overlay=None, held_words=(), today="2026-10-28", company=None):
        with tempfile.TemporaryDirectory() as d:
            core = os.path.join(d, "core")
            os.makedirs(core)
            for i, doc in enumerate(docs):
                with open(os.path.join(core, f"ch{i}.yaml"), "w") as f:
                    yaml.safe_dump(doc, f)
            ov = None
            if overlay:
                ov = os.path.join(d, "ov")
                os.makedirs(ov)
                with open(os.path.join(ov, "o.yaml"), "w") as f:
                    yaml.safe_dump(overlay, f)
            held = {check_content.word_hash(w) for w in held_words}
            return check_content.build(core, ov, held, today, company=company)

    def test_clean_chapter_passes(self):
        bundle, errors = self.run_gate([chapter([recall("a-01"), recall("a-02")])])
        self.assertEqual(errors, [])
        self.assertEqual(len(bundle["chapters"][0]["challenges"]), 2)

    def test_duplicate_ids_and_bad_indices_fail(self):
        duel = {"id": "a-02", "type": "duel", "bloom": "evaluate", "prompt": "Which?", "explain": "Because.", "source": SRC,
                "choices": ["x", "y"], "correct": 5, "reasons": ["a", "b", "c"], "reason": 0, "costs": ["a", "b", "c"], "cost": 0}
        _, errors = self.run_gate([chapter([recall("a-01"), recall("a-01"), duel])])
        self.assertTrue(any("used twice" in e for e in errors))
        self.assertTrue(any("'correct' must be an index" in e for e in errors))

    def test_source_must_be_allowlisted_and_vault_only_in_overlay(self):
        _, errors = self.run_gate([chapter([recall("a-01", source="https://example.com/x")])])
        self.assertTrue(any("allowlist" in e for e in errors))
        _, errors = self.run_gate([chapter([recall("a-01", source="vault:Some note")])])
        self.assertTrue(any("personal overlay" in e for e in errors))

    def test_content_carries_no_dates(self):
        _, errors = self.run_gate([chapter([recall("a-01", sealed_until="2026-11-03"), recall("a-02")], boss="a-02")])
        self.assertTrue(any("carries no dates" in e for e in errors))

    def test_a_held_word_leaves_its_challenge_out_without_naming_it(self):
        doc = [chapter([recall("a-01", prompt="Why use a widget here?"), recall("a-02")], boss="a-02")]
        bundle, errors = self.run_gate(doc, held_words=["widget"])
        self.assertEqual(errors, [])
        self.assertEqual([c["id"] for c in bundle["chapters"][0]["challenges"]], ["a-02"])
        self.assertEqual(bundle["held"], {"challenges": 1, "chapters": 0})
        self.assertNotIn("widget", str(bundle))
        bundle, _ = self.run_gate(doc)
        self.assertEqual(len(bundle["chapters"][0]["challenges"]), 2)
        self.assertNotIn("held", bundle)

    def test_a_held_boss_leaves_its_chapter_out_whole(self):
        doc = [chapter([recall("a-01"), recall("a-boss", prompt="Design the widget.")], boss="a-boss")]
        bundle, errors = self.run_gate(doc, held_words=["widget"])
        self.assertEqual(errors, [])
        self.assertEqual(bundle["chapters"], [])
        self.assertEqual(bundle["held"], {"challenges": 2, "chapters": 1})

    def test_a_hold_lifts_by_hand_on_its_date_or_after_the_interview(self):
        act = check_content.hold_active
        self.assertTrue(act("m", {}, "2026-10-28"))
        self.assertFalse(act("m", {"holds": {"m": {"lifted": True}}}, "2026-10-28"))
        self.assertTrue(act("m", {"holds": {"m": {"lifts": "2026-10-30"}}}, "2026-10-29"))
        self.assertFalse(act("m", {"holds": {"m": {"lifts": "2026-10-30"}}}, "2026-10-30"))
        self.assertTrue(act("m", {"interview_date": "2026-11-03"}, "2026-11-03"))
        self.assertFalse(act("m", {"interview_date": "2026-11-03"}, "2026-11-04"))
        doc = {"holds": [{"id": "m", "label": "Mock", "hashes": [check_content.word_hash("widget")]}]}
        self.assertEqual(check_content.held_hashes(doc, {"holds": {"m": {"lifted": True}}}, "2026-10-28"), set())

    def test_an_overlay_for_a_company_joins_only_while_the_profile_names_it(self):
        ov = {"extends_chapter": 1, "for_company": "Acme", "boss": "p-boss",
              "challenges": [recall("p-01", source=SRC), recall("p-boss", source=SRC)]}
        core = [chapter([recall("a-01"), recall("a-boss")])]
        for company, want in ((None, "a-boss"), ("Other", "a-boss"), (" acme ", "p-boss")):
            bundle, errors = self.run_gate(core, overlay=ov, company=company)
            self.assertEqual(errors, [])
            self.assertEqual(bundle["chapters"][0]["boss"], want, company)

    def test_overlay_inserts_before_the_boss_and_can_replace_it(self):
        ov = {"extends_chapter": 1, "boss": "p-boss", "challenges": [recall("p-01", source=SRC), recall("p-boss", source=SRC)]}
        bundle, errors = self.run_gate([chapter([recall("a-01"), recall("a-boss")])], overlay=ov)
        self.assertEqual(errors, [])
        ch = bundle["chapters"][0]
        self.assertEqual(ch["boss"], "p-boss")
        self.assertEqual([c["id"] for c in ch["challenges"]], ["a-01", "p-01", "p-boss", "a-boss"])

    def test_a_quest_needs_its_pillar_and_training_chapters_to_build_on(self):
        quest = {**chapter([recall("q-01"), recall("q-boss")]), "chapter": 9, "slug": "q", "kind": "quest",
                 "pillar": "Quests", "builds_on": [1]}
        _, errors = self.run_gate([chapter([recall("a-01")]), quest])
        self.assertEqual(errors, [])
        _, errors = self.run_gate([chapter([recall("a-01")]), {**quest, "builds_on": [7]}])
        self.assertTrue(any("isn't a training chapter" in e for e in errors))
        _, errors = self.run_gate([chapter([recall("a-01")]), {**quest, "pillar": "Patterns"}])
        self.assertTrue(any("pillar must be 'Quests'" in e for e in errors))
        _, errors = self.run_gate([chapter([recall("a-01")], builds_on=[1])])
        self.assertTrue(any("only a quest" in e for e in errors))

    def test_diagram_nodes_must_fit_and_slots_must_be_in_the_palette(self):
        fill = {"id": "a-02", "type": "fill", "bloom": "apply", "prompt": "Fill it.", "explain": "Because.", "source": SRC,
                "diagram": {"width": 300, "height": 100, "nodes": [{"id": "a", "label": "A", "x": 250, "y": 10}]},
                "slots": {"a": "Cache"}, "palette": ["Queue", "CDN"]}
        _, errors = self.run_gate([chapter([recall("a-01"), fill])])
        self.assertTrue(any("outside" in e for e in errors))
        self.assertTrue(any("missing from the palette" in e for e in errors))

    def test_touching_boxes_are_refused(self):
        sticker = {"id": "a-02", "type": "sticker", "bloom": "apply", "prompt": "Stick it.", "explain": "Because.", "source": SRC,
                   "diagram": {"nodes": [{"id": "a", "label": "A", "x": 10, "y": 10}, {"id": "b", "label": "B", "x": 130, "y": 10}]},
                   "stickers": ["Fast", "Safe"], "answers": {"a": ["Fast"]}}
        _, errors = self.run_gate([chapter([recall("a-01"), sticker])])
        self.assertTrue(any("overlap or touch" in e for e in errors))

    def test_a_multi_needs_more_than_one_and_a_half_times_as_many_options_as_right_ones(self):
        def multi(options, right):
            return {"id": "a-02", "type": "multi", "bloom": "understand", "prompt": "Which?", "explain": "Because.",
                    "source": SRC, "options": [f"o{i}" for i in range(options)], "correct": list(range(right))}
        for options, right, ok in ((3, 2, False), (4, 2, True), (6, 4, False), (7, 4, True), (7, 5, False), (8, 5, True), (8, 6, False)):
            _, errors = self.run_gate([chapter([recall("a-01"), multi(options, right)])])
            self.assertEqual(not any("ticking everything" in e for e in errors), ok, (options, right))
            # The rule is the arithmetic: ticking all of them scores (2 x right - options) / right of the base.
            self.assertEqual(ok, (2 * right - options) / right < 0.5, (options, right))
        _, errors = self.run_gate([chapter([recall("a-01"), multi(8, 6)])])
        self.assertTrue(any("at most 5 right" in e for e in errors), errors)  # eight options cannot hold six right

    def test_a_recall_may_carry_key_points_and_a_principle_within_limits(self):
        def recall_with(**extra):
            return chapter([recall("a-01", **extra), recall("a-02")])
        ok = {"key_points": ["one point", "another point"], "principle": "The idea in a line."}
        edge = {"key_points": ["x" * 140] + [f"point {i}" for i in range(5)], "principle": "p" * 240}  # six, at the limits
        for good in (ok, edge):
            self.assertEqual(self.run_gate([recall_with(**good)])[1], [])
        for bad, text in (({"key_points": ["only one"]}, "key_points"), ({"key_points": [f"p{i}" for i in range(7)]}, "key_points"),
                          ({"key_points": ["x" * 141, "fine"]}, "key_points"), ({"principle": "p" * 241}, "principle"),
                          ({"key_points": ["same", "same"]}, "duplicates"), ({"key_points": []}, "key_points"),
                          ({"key_points": None}, "key_points"), ({"key_points": "a, b"}, "key_points"),
                          ({"principle": ""}, "principle"), ({"principle": None}, "principle"),
                          ({"key_points": [["a"], "b"]}, "key_points[0]")):  # a list item is reported, not a crash
            _, errors = self.run_gate([recall_with(**bad)])
            self.assertTrue(any(text in e for e in errors), (bad, errors))

    def test_boss_prompt_label_is_refused(self):
        _, errors = self.run_gate([chapter([recall("a-01", prompt="Boss: do it")])])
        self.assertTrue(any("labels the boss itself" in e for e in errors))


if __name__ == "__main__":
    unittest.main()

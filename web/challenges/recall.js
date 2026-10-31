// The recall challenge: say or type an answer, then score it. With key points the player locks the answer in first and
// ticks what it covered; without them the player rates it with four buttons.
import { h } from "../dom.js";
import { tickList } from "./shared.js";

function recallByGrade(c, body, finish) {
  const ta = h("textarea", { placeholder: "Say it out loud, or type it here. Then reveal." });
  const reveal = h("button", { class: "btn" }, "Show the answer");
  const grade = h("div");
  reveal.onclick = () => {
    reveal.remove();
    ta.disabled = true;
    grade.append(
      h("div", { class: "answerbox" }, h("b", {}, "Answer: "), c.answer),
      h("div", { class: "muted" }, "How did you do?"),
      h(
        "div",
        { class: "row" },
        [
          ["again", "❌ Missed it"],
          ["hard", "🟡 Partly"],
          ["good", "✅ Got it"],
          ["easy", "⚡ Easy"],
        ].map(([g, label]) =>
          h(
            "button",
            {
              class: "btn ghost",
              onclick: (e) => {
                grade.querySelectorAll("button").forEach((b) => {
                  b.disabled = true;
                  b.setAttribute("aria-pressed", String(b === e.target));
                });
                e.target.classList.add("sel");
                finish({ grade: g, text: ta.value });
              },
            },
            label,
          ),
        ),
      ),
    );
  };
  body.append(ta, h("p"), reveal, grade);
}

// The principle first, if the question has one, then one way to say it.
const modelBoxes = (c) =>
  [
    c.principle && h("div", { class: "answerbox" }, h("b", {}, "The idea: "), c.principle),
    h("div", { class: "answerbox" }, h("b", {}, "One way to say it: "), c.answer),
  ].filter(Boolean);

function recallByPoints(c, body, finish) {
  const ta = h("textarea", { placeholder: "Type your answer, or say it out loud and tick the box below." });
  const said = h("input", { type: "checkbox" });
  const lock = h("button", { class: "btn", disabled: true }, "Lock in my answer, then show the model");
  const after = h("div");
  const ready = () => (lock.disabled = !said.checked && ta.value.trim().length < 10);
  ta.addEventListener("input", ready);
  said.addEventListener("change", ready);
  lock.onclick = () => {
    [ta, said, lock].forEach((el) => (el.disabled = true));
    const heading = "Tick the key points your answer covered. They set your points.";
    const locked = h(
      "div",
      { class: "muted", role: "status", tabindex: "-1" },
      "Locked: your answer can't change now.",
    );
    after.append(
      locked,
      ...modelBoxes(c),
      ...tickList(c.key_points, heading, (ticked) => finish({ ticked, text: ta.value })),
    );
    locked.focus(); // the button that was pressed is disabled now: say what happened, and start the next step from here
  };
  body.append(ta, h("label", { class: "said" }, said, "I said it out loud"), h("p"), lock, after);
}

export const recall = (c, body, finish) => (c.key_points ? recallByPoints : recallByGrade)(c, body, finish);

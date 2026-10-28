// The recall challenge.
import { h } from "../dom.js";

export function recall(c, body, finish) {
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
                grade.querySelectorAll("button").forEach((b) => (b.disabled = true));
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

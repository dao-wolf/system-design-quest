// The estimate challenge.
import { generate } from "../engine.js";
import { h } from "../dom.js";
import { submitBtn } from "./shared.js";

export function estimate(c, body, finish) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const g = generate(c.generator, seed);
  const inp = h("input", { type: "number", min: "0", step: "any", placeholder: `Your estimate, in ${g.unit}` });
  const btn = submitBtn();
  inp.oninput = () => (btn.disabled = !(Number(inp.value) > 0));
  inp.onkeydown = (e) => {
    if (e.key === "Enter" && !btn.disabled) btn.click();
  };
  btn.onclick = () => {
    inp.disabled = true;
    finish({ seed, value: Number(inp.value) });
  };
  body.append(
    h("div", { class: "answerbox" }, g.question),
    h("div", { class: "row" }, inp, h("span", { class: "muted" }, g.unit)),
    h("p"),
    btn,
  );
}

export function reveal(c, res) {
  const g = generate(c.generator, res.seed);
  return h(
    "div",
    { class: "answerbox" },
    h("div", {}, h("b", {}, "Worked: "), g.working),
    h(
      "div",
      { class: "muted" },
      `You said ${res.value}. Anything within ×1.6 of the worked answer counts: interview maths is about the order of magnitude.`,
    ),
  );
}

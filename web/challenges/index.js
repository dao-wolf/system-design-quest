// Every challenge type: its label, whether the player grades it, how it draws, and any answer to reveal.
import { recall } from "./recall.js";
import { multi } from "./multi.js";
import { duel } from "./duel.js";
import { write } from "./write.js";
import { estimate, reveal as revealEstimate } from "./estimate.js";
import { fill } from "./fill.js";
import { sticker } from "./sticker.js";
import { flaw } from "./flaw.js";
import { order } from "./order.js";
import { lightning } from "./lightning.js";
import { sprint } from "./sprint.js";

export const TYPE_LABEL = {
  recall: "🃏 Recall",
  multi: "☑️ Pick all that apply",
  duel: "⚖️ Trade-off duel",
  write: "✍️ Write it",
  estimate: "🔢 Estimate",
  fill: "🧩 Fill the diagram",
  sticker: "🏷️ Sticker the diagram",
  flaw: "🔍 Spot the flaw",
  order: "↕️ Put it in order",
  lightning: "⚡ Lightning round",
  sprint: "⏱️ Sprint",
};
export const SELF_GRADED = new Set(["recall", "write", "sprint", "lightning"]);

export const RENDER = { recall, multi, duel, write, estimate, fill, sticker, flaw, order, lightning, sprint };

export const REVEAL_TEXT = {
  estimate: revealEstimate,
  recall: () => null,
};

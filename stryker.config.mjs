// Mutation testing: Stryker changes the scoring engine on purpose, and the unit
// tests must notice. The page is covered by the Playwright journeys instead.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "command",
  commandRunner: { command: "node --test tests/engine.test.mjs" },
  coverageAnalysis: "off",
  mutate: ["web/engine.js"],
  // A full run scored 72.7% on 28 Oct 2026 (514 of 707 mutants caught). break fails the run below 70, about 19
  // more survivors; raise it as the tests get stronger. low matches it, so a failing score always shows red.
  thresholds: { high: 80, low: 70, break: 70 },
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["clear-text", "progress", "html", "json"],
  concurrency: 4,
  timeoutMS: 10000,
};

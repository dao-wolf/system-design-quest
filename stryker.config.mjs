// Mutation testing: Stryker changes the scoring engine on purpose, and the unit
// tests must notice. The page is covered by the Playwright journeys instead.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "command",
  commandRunner: { command: "node --test tests/engine.test.mjs" },
  coverageAnalysis: "off",
  mutate: ["web/engine.js"],
  thresholds: { high: 80, low: 60, break: 50 },
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["clear-text", "progress", "html", "json"],
  concurrency: 4,
  timeoutMS: 10000,
};

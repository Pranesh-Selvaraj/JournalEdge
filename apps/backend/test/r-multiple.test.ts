import test from "node:test";
import assert from "node:assert/strict";
import { calculateRMultiple } from "../src/services/r-multiple.js";

test("calculates long R multiple", () => {
  assert.equal(calculateRMultiple({ direction: "long", entryPrice: 100, exitPrice: 120, stopLoss: 90 }), 2);
});

test("calculates short R multiple", () => {
  assert.equal(calculateRMultiple({ direction: "short", entryPrice: 100, exitPrice: 80, stopLoss: 110 }), 2);
});

test("rejects missing or invalid risk", () => {
  assert.equal(calculateRMultiple({ direction: "long", entryPrice: 100, exitPrice: 120 }), null);
  assert.equal(calculateRMultiple({ direction: "long", entryPrice: 100, exitPrice: 120, stopLoss: 100 }), null);
});

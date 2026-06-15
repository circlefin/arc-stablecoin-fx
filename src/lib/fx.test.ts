import assert from "node:assert/strict";
import test from "node:test";

import {
  isSupportedSwapRoute,
  unsupportedSwapRouteMessage,
} from "./fx";

test("USDC to EURC is a supported Arc Testnet swap route", () => {
  assert.equal(isSupportedSwapRoute("USDC", "EURC"), true);
});

test("EURC to USDC is blocked before calling Circle AppKit", () => {
  assert.equal(isSupportedSwapRoute("EURC", "USDC"), false);
});

test("unsupported route message explains the unavailable direction", () => {
  assert.match(unsupportedSwapRouteMessage("EURC", "USDC"), /EURC .* USDC/);
  assert.match(unsupportedSwapRouteMessage("EURC", "USDC"), /not available/i);
});

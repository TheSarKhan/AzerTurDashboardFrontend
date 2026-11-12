import assert from "node:assert/strict";
import { lineAmount } from "../src/offer-pricing.ts";
assert.equal(lineAmount({ quantity: 100, nights: 1, unitPrice: 0.145 }), 15);
assert.equal(lineAmount({ quantity: 2, nights: 1, unitPrice: 121.5 }), 243);
assert.equal(lineAmount({ quantity: 1, nights: 1, unitPrice: 110 }), 110);
assert.equal(lineAmount({ quantity: 2, nights: 3, unitPrice: 110 }), 660);
console.log(
  "Offer prices passed: exact half rounding, converted fractional units and accommodation quantities.",
);

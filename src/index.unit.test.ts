import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { add } from "./index.ts";

describe("add", () => {
  it("should add two numbers correctly", () => {
    assert.equal(add(1, 2), 3);
  });
});

import { describe, expect, it } from "vitest";

import { sha256 } from "../src/sha256.js";

describe("internal synchronous SHA-256 utility", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["CSS 😀 @property", "161991d755a7d4090a61245afac1f7c8d665bca95ff19737216a19a86cb3b262"],
  ])("AC-DIAG-004 matches a published/Node-known vector for %j", (input, expected) => {
    expect(sha256(input)).toBe(expected);
  });
});

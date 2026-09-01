import { describe, expect, it } from "vitest";

import { isCanonicalBase64Body } from "./base64";

// The invariant this shared boundary owns: recognize exactly the canonical standard
// base64 grammar, using a linear scan that cannot overflow the stack on large payloads.
// The reference grammar is the pattern the certification gate used before the fix.
const REFERENCE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

describe("isCanonicalBase64Body", () => {
  it("accepts canonical bodies and rejects malformed ones", () => {
    for (const value of ["", "QUJD", "QUJDRA==", "QUJDRUY=", "ABCD", "+/+/", "QQ=="]) {
      expect(isCanonicalBase64Body(value)).toBe(true);
    }
    for (const value of ["ABC", "AB", "A===", "====", "QQ==QQ==", "ABC=DEF", "abcd efgh", "abc-d", "abc_d", "ABC\n"]) {
      expect(isCanonicalBase64Body(value)).toBe(false);
    }
  });

  it("matches the reference base64 grammar across randomized inputs", () => {
    const alphabet = "ABCXYZabc012+/=\n \t-_@";
    for (let iteration = 0; iteration < 20_000; iteration += 1) {
      const length = Math.floor(Math.random() * 24);
      let value = "";
      for (let index = 0; index < length; index += 1) {
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      expect(isCanonicalBase64Body(value)).toBe(REFERENCE.test(value));
    }
  });

  it("validates a multi-megabyte payload in bounded stack space (the class root)", () => {
    // ~8M canonical base64 characters. The old grouped-repeat regex overflowed V8's
    // regex stack here ("Maximum call stack size exceeded"); the linear scan must not.
    const large = "QUJD".repeat(2 * 1024 * 1024); // 8 MiB, length a multiple of 4
    expect(() => isCanonicalBase64Body(large)).not.toThrow();
    expect(isCanonicalBase64Body(large)).toBe(true);
    expect(isCanonicalBase64Body(`${large}=`)).toBe(false); // length no longer % 4 === 0
  });
});

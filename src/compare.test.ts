import { describe, test, expect } from "bun:test";
import { levenshteinDistance, normalizeCode, validateModelName } from "./compare.ts";

describe("levenshteinDistance", () => {
  test("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  test("returns correct distance for simple cases", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("saturday", "sunday")).toBe(3);
  });

  test("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  test("handles single character differences", () => {
    expect(levenshteinDistance("a", "b")).toBe(1);
    expect(levenshteinDistance("ab", "ac")).toBe(1);
  });
});

describe("normalizeCode", () => {
  test("removes extra whitespace and normalizes", () => {
    const input = "function  test()   { return  1; }";
    const expected = "function test(){return 1;}";
    expect(normalizeCode(input)).toBe(expected);
  });

  test("removes whitespace around punctuation", () => {
    const input = "function add ( a , b ) { return 1; }";
    const expected = "function add(a,b){return 1;}";
    expect(normalizeCode(input)).toBe(expected);
  });

  test("converts to lowercase", () => {
    expect(normalizeCode("HELLO WORLD")).toBe("hello world");
  });

  test("trims leading and trailing whitespace", () => {
    expect(normalizeCode("  hello  ")).toBe("hello");
  });

  test("handles complex code", () => {
    const input = `
      function calculate( x , y )
      {
        return x + y ;
      }
    `;
    const expected = "function calculate(x,y){return x + y ;}";
    expect(normalizeCode(input)).toBe(expected);
  });
});

describe("validateModelName", () => {
  test("accepts valid model names with alphanumeric and special chars", () => {
    expect(validateModelName("opencode/minimax-m2.5-free")).toBe(true);
    expect(validateModelName("model_name")).toBe(true);
    expect(validateModelName("model-name")).toBe(true);
    expect(validateModelName("model.name")).toBe(true);
    expect(validateModelName("model:name")).toBe(true);
  });

  test("rejects empty strings", () => {
    expect(validateModelName("")).toBe(false);
  });

  test("rejects names with special characters", () => {
    expect(validateModelName("model;name")).toBe(false);
    expect(validateModelName("model&name")).toBe(false);
    expect(validateModelName("model|name")).toBe(false);
    expect(validateModelName("model'name")).toBe(false);
    expect(validateModelName('model"name"')).toBe(false);
  });

  test("rejects overly long names", () => {
    const longName = "a".repeat(101);
    expect(validateModelName(longName)).toBe(false);
  });

  test("accepts reasonable length names", () => {
    expect(validateModelName("a".repeat(100))).toBe(true);
  });
});

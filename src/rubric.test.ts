import { describe, test, expect } from "bun:test";
import { evaluateRubric, extractUrls, extractVerdict } from "./rubric.ts";
import type { CaseRubric } from "./types.ts";

describe("evaluateRubric defect-id", () => {
  const rubric: CaseRubric = {
    anchorRef: "expected.md",
    criteria: [
      { id: "SQLI", weight: 1, signal: "defect-id" },
      { id: "N+1", weight: 1, signal: "defect-id" },
    ],
  };

  test("finds the seeded defects present in the text", () => {
    const evaluation = evaluateRubric("Found SQLI in the handler.", rubric);
    expect(evaluation.defectsFound).toEqual(["SQLI"]);
  });

  test("counts the seeded defects that are missing", () => {
    const evaluation = evaluateRubric("Found SQLI in the handler.", rubric);
    expect(evaluation.defectsMissing).toEqual(["N+1"]);
  });
});

describe("evaluateRubric citation-reachable", () => {
  test("extracts and counts URLs without calling them", () => {
    const rubric: CaseRubric = {
      anchorRef: "expected.md",
      criteria: [{ id: "cites", weight: 1, signal: "citation-reachable" }],
    };
    const evaluation = evaluateRubric("See https://a.example/x and https://b.example/y.", rubric);
    expect(evaluation.urls).toEqual(["https://a.example/x", "https://b.example/y"]);
    expect(evaluation.criteria[0].score).toBe(1);
  });

  test("scores zero when the text has no URL", () => {
    const rubric: CaseRubric = {
      anchorRef: "expected.md",
      criteria: [{ id: "cites", weight: 1, signal: "citation-reachable" }],
    };
    expect(evaluateRubric("no links here", rubric).criteria[0].score).toBe(0);
  });
});

describe("evaluateRubric judge", () => {
  test("leaves the judge criterion pending and does not break the score", () => {
    const rubric: CaseRubric = {
      anchorRef: "expected.md",
      criteria: [
        { id: "quote", weight: 1, signal: "quote-present" },
        { id: "prose", weight: 5, signal: "judge" },
      ],
    };
    const evaluation = evaluateRubric("this quote is here", rubric);
    const judge = evaluation.criteria.find((criterion) => criterion.id === "prose")!;
    expect(judge.pending).toBe(true);
    expect(judge.score).toBeNull();
    expect(evaluation.pending).toEqual(["prose"]);
    expect(evaluation.weightedScore).toBe(1);
  });
});

describe("evaluateRubric weighting", () => {
  test("respects the weight of each criterion", () => {
    const rubric: CaseRubric = {
      anchorRef: "expected.md",
      criteria: [
        { id: "present quote", weight: 1, signal: "quote-present" },
        { id: "absent quote", weight: 3, signal: "quote-present" },
      ],
    };
    const evaluation = evaluateRubric("this has a present quote inside", rubric);
    expect(evaluation.weightedScore).toBeCloseTo((1 * 1 + 0 * 3) / 4, 10);
  });
});

describe("verdict helpers", () => {
  test("matches the declared verdict against the criterion id", () => {
    const rubric: CaseRubric = {
      anchorRef: "expected.md",
      criteria: [{ id: "fail", weight: 1, signal: "verdict-match" }],
    };
    expect(evaluateRubric("Verdict: fail", rubric).criteria[0].score).toBe(1);
    expect(evaluateRubric("Verdict: pass", rubric).criteria[0].score).toBe(0);
  });

  test("extractVerdict returns null when none is declared", () => {
    expect(extractVerdict("nothing here")).toBeNull();
  });

  test("extractUrls returns an empty list for text without URLs", () => {
    expect(extractUrls("nothing here")).toEqual([]);
  });
});

import { expect, it } from "vitest";
import { formatRecommendationDelta, getProposedParams } from "./chatActionParams";

const before = { sets: 3, reps: 12, weight: 34, time: null, rest: 60 };

it("shows both changes from a real policy action rather than claiming parameters are missing", () => {
  const action = { type: "update_weight", template_exercise_id: 249, weight: 36, reps: 8,
    changes: { weight: { from: 34, to: 36 }, reps: { from: 12, to: 8 } } };
  expect(formatRecommendationDelta(before, getProposedParams(action)))
    .toBe("повторы 12 → 8, вес 34 → 36");
});

it("shows a repetition-only policy without inventing a weight change", () => {
  expect(formatRecommendationDelta({ ...before, reps: 10 }, getProposedParams({
    type: "update_weight", reps: 11, changes: { reps: { from: 10, to: 11 } },
  }))).toBe("повторы 10 → 11");
});

it("keeps manual actions, aliases, and a zero weight readable", () => {
  expect(formatRecommendationDelta(before, getProposedParams({ weight: 0, reps: 10 })))
    .toBe("повторы 12 → 10, вес 34 → 0");
  expect(formatRecommendationDelta(before, getProposedParams({ parameters: { rep_override: "11" } })))
    .toBe("повторы 12 → 11");
});

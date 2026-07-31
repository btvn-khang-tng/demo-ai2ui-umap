import { describe, it, expect } from "vitest";
import { overestimScore, welchDf, log2FoldChange, tTwoSidedP } from "../../src/server/stats/ttest";

describe("overestimScore", () => {
  it("uses n_g in BOTH variance denominators", () => {
    // mg=2, vg=1, ng=10; mr=1, vr=4
    // overestim: (2-1)/sqrt(1/10 + 4/10) = 1/sqrt(0.5) = 1.41421356
    expect(overestimScore(2, 1, 1, 4, 10)).toBeCloseTo(1 / Math.sqrt(0.5), 10);
  });

  it("differs from the naive n_r formula (regression guard)", () => {
    // naive with n_r=90 would be 1/sqrt(1/10 + 4/90) = 1/sqrt(0.14444) = 2.631
    expect(overestimScore(2, 1, 1, 4, 10)).not.toBeCloseTo(2.631, 2);
  });

  it("returns 0 when both variances are 0", () => {
    expect(overestimScore(1, 0, 1, 0, 5)).toBe(0);
  });
});

describe("welchDf", () => {
  it("reduces to (n_g-1)(vg+vr)^2 / (vg^2+vr^2)", () => {
    // vg=1, vr=4, ng=10 → 9 * 25 / 17 = 13.2353
    expect(welchDf(1, 4, 10)).toBeCloseTo((9 * 25) / 17, 10);
  });

  it("falls back to 1 when undefined", () => {
    expect(welchDf(0, 0, 10)).toBe(1);
  });
});

describe("log2FoldChange", () => {
  it("un-logs with expm1 before the ratio", () => {
    // mg=log1p(3)=1.386, mr=log1p(1)=0.693 → log2((3+1e-9)/(1+1e-9)) = log2(3)
    expect(log2FoldChange(Math.log1p(3), Math.log1p(1))).toBeCloseTo(Math.log2(3), 6);
  });

  it("is negative when the group is lower", () => {
    expect(log2FoldChange(Math.log1p(1), Math.log1p(4))).toBeCloseTo(-2, 6);
  });
});

describe("tTwoSidedP", () => {
  // reference values from scipy.stats.t.sf(t, df) * 2
  it("matches known two-sided p-values", () => {
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(0, 10)).toBeCloseTo(1.0, 10);
    expect(tTwoSidedP(1.96, 1e6)).toBeCloseTo(0.05, 3);
  });

  it("is symmetric in the sign of t", () => {
    expect(tTwoSidedP(-3, 20)).toBeCloseTo(tTwoSidedP(3, 20), 12);
  });

  it("does not underflow to exactly 0 for large t", () => {
    expect(tTwoSidedP(35.55, 1200)).toBeGreaterThan(0);
    expect(tTwoSidedP(35.55, 1200)).toBeLessThan(1e-100);
  });
});

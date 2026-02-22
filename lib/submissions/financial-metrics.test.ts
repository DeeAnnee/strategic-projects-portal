import { describe, expect, it } from "vitest";

import type { FinancialDetails, FinancialGrid } from "./types";
import { calculateFinancialMetrics } from "./financial-metrics";

const makeGrid = (overrides?: Partial<FinancialGrid>): FinancialGrid => ({
  commencementFiscalYear: 2026,
  investment: {
    hardware: { priorYears: 0, currentFiscal: 0, future: 0 },
    software: { priorYears: 0, currentFiscal: 0, future: 0 },
    consultancyVendor: { priorYears: 0, currentFiscal: 0, future: 0 },
    premisesRealEstate: { priorYears: 0, currentFiscal: 0, future: 0 },
    otherCapital: { priorYears: 0, currentFiscal: 0, future: 0 },
    expenses: { priorYears: 0, currentFiscal: 0, future: 0 }
  },
  incremental: {
    years: [2027, 2028, 2029, 2030, 2031],
    revenue: [0, 0, 0, 0, 0],
    savedCosts: [0, 0, 0, 0, 0],
    addlOperatingCosts: [0, 0, 0, 0, 0]
  },
  ...overrides
});

const makeFinancials = (overrides?: Partial<FinancialDetails>): FinancialDetails => ({
  capex: 0,
  opex: 0,
  oneTimeCosts: 0,
  runRateSavings: 0,
  paybackMonths: 0,
  ...overrides
});

describe("calculateFinancialMetrics", () => {
  it("computes NPV, IRR and payback from net cash flows", () => {
    const grid = makeGrid({
      incremental: {
        years: [2027, 2028, 2029, 2030, 2031],
        revenue: [200, 200, 200, 200, 200],
        savedCosts: [0, 0, 0, 0, 0],
        addlOperatingCosts: [0, 0, 0, 0, 0]
      }
    });
    const financials = makeFinancials({ oneTimeCosts: 300 });

    const metrics = calculateFinancialMetrics(grid, financials);

    const expectedNpv =
      -300 +
      200 / 1.14 +
      200 / 1.14 ** 2 +
      200 / 1.14 ** 3 +
      200 / 1.14 ** 4 +
      200 / 1.14 ** 5;

    expect(metrics.cashFlows).toHaveLength(7);
    expect(metrics.cashFlows[0]).toBeCloseTo(0, 8);
    expect(metrics.cashFlows.slice(1)).toEqual([-300, 200, 200, 200, 200, 200]);
    expect(metrics.npv).toBeCloseTo(expectedNpv, 2);
    expect(metrics.irrPct).not.toBeNull();
    expect(metrics.paybackYears).toBeCloseTo(2.5, 2);
    expect(metrics.paybackLabel).toBe("2.50");
  });

  it("returns Negative or >6 when cumulative cash flow never becomes positive", () => {
    const grid = makeGrid({
      incremental: {
        years: [2027, 2028, 2029, 2030, 2031],
        revenue: [20, 20, 20, 20, 20],
        savedCosts: [0, 0, 0, 0, 0],
        addlOperatingCosts: [0, 0, 0, 0, 0]
      }
    });
    const financials = makeFinancials({ oneTimeCosts: 300 });

    const metrics = calculateFinancialMetrics(grid, financials);

    expect(metrics.paybackYears).toBeNull();
    expect(metrics.paybackLabel).toBe("Negative or >6");
  });
});

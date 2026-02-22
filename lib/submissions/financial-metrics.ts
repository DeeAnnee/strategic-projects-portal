import type { FinancialDetails, FinancialGrid } from "@/lib/submissions/types";

export const usefulLifeByCategory: Record<keyof FinancialGrid["investment"], number> = {
  hardware: 4,
  software: 5,
  consultancyVendor: 5,
  premisesRealEstate: 10,
  otherCapital: 5,
  expenses: 1
};

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const hasPositiveAndNegative = (values: number[]) => {
  let hasPositive = false;
  let hasNegative = false;

  values.forEach((value) => {
    if (value > 0) hasPositive = true;
    if (value < 0) hasNegative = true;
  });

  return hasPositive && hasNegative;
};

const npvAtRate = (rate: number, cashFlows: number[]) =>
  cashFlows.reduce((sum, flow, index) => sum + flow / (1 + rate) ** index, 0);

const derivativeAtRate = (rate: number, cashFlows: number[]) =>
  cashFlows.reduce((sum, flow, index) => {
    if (index === 0) return sum;
    return sum - (index * flow) / (1 + rate) ** (index + 1);
  }, 0);

const computeIrr = (cashFlows: number[]): number | null => {
  if (!hasPositiveAndNegative(cashFlows)) {
    return null;
  }

  let rate = 0.1;
  for (let i = 0; i < 100; i += 1) {
    const value = npvAtRate(rate, cashFlows);
    const derivative = derivativeAtRate(rate, cashFlows);
    if (Math.abs(derivative) < 1e-8) {
      break;
    }

    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= -0.9999 || nextRate > 100) {
      break;
    }

    if (Math.abs(nextRate - rate) < 1e-8) {
      return round(nextRate * 100, 2);
    }

    rate = nextRate;
  }

  let low = -0.99;
  let high = 10;
  let lowValue = npvAtRate(low, cashFlows);
  let highValue = npvAtRate(high, cashFlows);
  if (Math.sign(lowValue) === Math.sign(highValue)) {
    return null;
  }

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const midValue = npvAtRate(mid, cashFlows);

    if (Math.abs(midValue) < 1e-7) {
      return round(mid * 100, 2);
    }

    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
      highValue = midValue;
    }
  }

  return round(((low + high) / 2) * 100, 2);
};

const computeNpv = (cashFlows: number[], discountRate = 0.14): number => {
  const priorAndZero = cashFlows.slice(0, 2).reduce((sum, value) => sum + value, 0);
  const postZero = cashFlows.slice(2);
  const discountedPostZero = postZero.reduce(
    (sum, value, index) => sum + value / (1 + discountRate) ** (index + 1),
    0
  );

  return round(priorAndZero + discountedPostZero, 2);
};

const computePaybackYears = (cashFlows: number[], maxYears = 6): number | null => {
  if (cashFlows.length < 2) {
    return null;
  }

  let cumulative = cashFlows[0] + cashFlows[1];
  if (cumulative > 0) {
    return 0.99;
  }

  const maxIndex = Math.min(cashFlows.length - 1, maxYears + 1);
  for (let i = 2; i <= maxIndex; i += 1) {
    const previousCumulative = cumulative;
    const periodFlow = cashFlows[i];
    cumulative += periodFlow;

    if (cumulative > 0) {
      if (Math.abs(periodFlow) < 1e-8) {
        return i - 1;
      }

      const fractionalYear = Math.abs(previousCumulative / periodFlow);
      return round(i - 1 + fractionalYear, 2);
    }
  }

  return null;
};

const formatPaybackLabel = (paybackYears: number | null) => {
  if (paybackYears === null) {
    return "Negative or >6";
  }

  if (paybackYears < 1) {
    return "<1";
  }

  return round(paybackYears, 2).toFixed(2);
};

const capitalKeys: Array<keyof FinancialGrid["investment"]> = [
  "hardware",
  "software",
  "consultancyVendor",
  "premisesRealEstate",
  "otherCapital"
];

export const calculateDepreciationOfCapitalByYear = (financialGrid: FinancialGrid): number[] => {
  const annualDepreciation = capitalKeys.reduce((sum, key) => {
    const usefulLife = usefulLifeByCategory[key];
    const investment = financialGrid.investment[key];
    const lifeTotal = investment.priorYears + investment.currentFiscal + investment.future;
    return sum + lifeTotal / usefulLife;
  }, 0);

  return financialGrid.incremental.years.map(() => round(annualDepreciation, 2));
};

export const calculateNetBenefitsByYear = (
  financialGrid: FinancialGrid,
  financials?: Pick<FinancialDetails, "opex">
): number[] => {
  const depreciation = calculateDepreciationOfCapitalByYear(financialGrid);
  const opex = financials?.opex ?? 0;

  return financialGrid.incremental.years.map((_, index) =>
    round(
      financialGrid.incremental.revenue[index] -
        (financialGrid.incremental.savedCosts[index] +
          depreciation[index] +
          financialGrid.incremental.addlOperatingCosts[index] +
          opex),
      2
    )
  );
};

export type FinancialMetrics = {
  discountRate: number;
  cashFlows: number[];
  npv: number;
  irrPct: number | null;
  paybackYears: number | null;
  paybackLabel: string;
};

export const calculateFinancialMetrics = (
  financialGrid: FinancialGrid,
  financials: FinancialDetails,
  discountRate = 0.14
): FinancialMetrics => {
  const categories = Object.keys(financialGrid.investment) as Array<keyof FinancialGrid["investment"]>;

  const priorCapital = categories.reduce(
    (sum, category) => sum + financialGrid.investment[category].priorYears,
    0
  );
  const currentCapital = categories.reduce(
    (sum, category) => sum + financialGrid.investment[category].currentFiscal,
    0
  );
  const cashFlowPrior = -priorCapital;
  const cashFlowZero = -currentCapital - financials.oneTimeCosts;
  const cashFlowYears = calculateNetBenefitsByYear(financialGrid, financials);

  const cashFlows = [cashFlowPrior, cashFlowZero, ...cashFlowYears].map((value) =>
    Number.isFinite(value) ? value : 0
  );
  const paybackYears = computePaybackYears(cashFlows);

  return {
    discountRate,
    cashFlows,
    npv: computeNpv(cashFlows, discountRate),
    irrPct: computeIrr(cashFlows),
    paybackYears,
    paybackLabel: formatPaybackLabel(paybackYears)
  };
};

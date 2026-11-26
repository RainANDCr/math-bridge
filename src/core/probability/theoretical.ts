import type { BooleanFunction, CellValue } from "../boolean/model";

/**
 * 理论概率
 *
 * 前提必须写清楚：各输入变量相互独立。
 * 在这个假设下，一个具体输入组合 x 的概率 = 各变量取对应值的概率之积。
 * 于是  P(F=1) = Σ_{x: F(x)=1} P(x)
 *
 * 若函数含无关项 X，概率不是一个定值，而是一个区间：
 *   下界：所有 X 都取 0；上界：所有 X 都取 1。
 * 界面会把区间明确显示出来，而不是假装有唯一答案。
 */

export interface RowProbability {
  index: number;
  value: CellValue;
  /** 该输入组合出现的概率 */
  weight: number;
}

export interface TheoreticalResult {
  p1: number;
  p0: number;
  hasDontCares: boolean;
  /** 无关项全部取 0 时的 P(F=1)（下界） */
  lowerBound: number;
  /** 无关项全部取 1 时的 P(F=1)（上界） */
  upperBound: number;
  rows: RowProbability[];
  /** 输入概率是否退化（存在 0 或 1），用于提示 */
  degenerate: boolean;
}

export function clampProbability(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

export function normalizeProbabilities(
  fn: BooleanFunction,
  probabilities: number[]
): number[] {
  return fn.variables.map((_, i) => clampProbability(probabilities[i] ?? 0.5));
}

export function theoreticalProbability(
  fn: BooleanFunction,
  inputProbabilities: number[]
): TheoreticalResult {
  const probs = normalizeProbabilities(fn, inputProbabilities);
  const n = fn.variables.length;
  const total = 1 << n;
  const rows: RowProbability[] = [];

  let p1 = 0;
  let pDontCare = 0;
  let degenerate = probs.some((p) => p <= 0 || p >= 1);

  for (let i = 0; i < total; i += 1) {
    let weight = 1;
    for (let j = 0; j < n; j += 1) {
      const bit = (i >> (n - 1 - j)) & 1;
      weight *= bit === 1 ? probs[j] : 1 - probs[j];
    }
    const value = fn.values[i] ?? "X";
    rows.push({ index: i, value, weight });
    if (value === 1) p1 += weight;
    else if (value === "X") pDontCare += weight;
  }

  const hasDontCares = fn.values.some((v) => v === "X");
  if (!degenerate && total > 0) {
    // 浮点累加的微小误差不应显示成 1.0000000002
    p1 = Math.min(1, Math.max(0, p1));
    pDontCare = Math.min(1, Math.max(0, pDontCare));
  }

  return {
    p1,
    p0: 1 - p1 - (hasDontCares ? pDontCare : 0),
    hasDontCares,
    lowerBound: p1,
    upperBound: Math.min(1, p1 + pDontCare),
    rows,
    degenerate,
  };
}

/** 输出分布：P(F=0) / P(F=1) / P(F=X) */
export function outputDistribution(result: TheoreticalResult): Array<{
  label: string;
  value: number;
}> {
  const dc = result.rows.reduce((acc, r) => acc + (r.value === "X" ? r.weight : 0), 0);
  return [
    { label: "F = 0", value: Math.max(0, result.p0) },
    { label: "F = 1", value: result.p1 },
    ...(dc > 1e-12 ? [{ label: "F = X（无关项）", value: dc }] : []),
  ];
}

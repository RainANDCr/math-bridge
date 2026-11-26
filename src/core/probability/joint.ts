import type { BooleanFunction, CellValue } from "../boolean/model";
import { mulberry32, type SimulationResult } from "./simulation";

/**
 * 输入相关性建模（联合分布）
 *
 * 概率实验室的默认模型是「各输入独立」：P(x) = Π P(x_i)。
 * 这个假设很方便，但它不是逻辑的必然 —— A 与 B 完全可能同涨同落。
 * 一旦相关，P(A∩B) ≠ P(A)·P(B)，输出的概率也会变。
 *
 * 这里改用**联合分布**：直接给出 2^n 个输入组合各自的概率（权重，内部归一化）。
 * 独立模型是它的一个特例（权重恰好等于边缘概率之积），所以两种模型可以并排对比：
 * 边缘概率相同、P(F=1) 却不同 —— 这正好说明「相关性不可由边缘概率推出」。
 *
 * 蒙特卡洛也按联合分布抽样：先按权重抽一行，再查真值表。
 * 抽的是真实分布，不是「照着理论值造数据」。
 */

export interface JointRow {
  index: number;
  value: CellValue;
  /** 归一化后的概率 */
  weight: number;
}

export interface DependencePair {
  i: number;
  j: number;
  /** 联合分布下 P(X_i=1 ∧ X_j=1) */
  pBoth: number;
  /** 若独立应为 P(X_i=1)·P(X_j=1) */
  pProduct: number;
  /** 差值的绝对值；大于阈值就认为这两个输入相关 */
  delta: number;
  dependent: boolean;
}

export interface JointAnalysis {
  rows: JointRow[];
  p1: number;
  pDontCare: number;
  lowerBound: number;
  upperBound: number;
  /** 各变量的边缘概率 P(X_i=1) */
  marginals: number[];
  /** 用这些边缘概率按独立模型算出的 P(F=1) */
  independentP1: number;
  /** 联合模型与独立模型的差 */
  delta: number;
  pairs: DependencePair[];
  /** 原始权重之和；为 0 时按均匀分布处理 */
  totalWeight: number;
}

export function normalizeJoint(weights: number[]): number[] {
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const sum = safe.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) return safe.map(() => (safe.length === 0 ? 0 : 1 / safe.length));
  return safe.map((weight) => weight / sum);
}

function bitAt(row: number, n: number, position: number): 0 | 1 {
  return ((row >> (n - 1 - position)) & 1) as 0 | 1;
}

export function jointMarginals(weights: number[], n: number): number[] {
  const total = 1 << n;
  const normalized = normalizeJoint(weights.slice(0, total));
  const marginals = new Array(n).fill(0);
  for (let row = 0; row < total; row += 1) {
    for (let j = 0; j < n; j += 1) {
      if (bitAt(row, n, j) === 1) marginals[j] += normalized[row];
    }
  }
  return marginals;
}

/** 用一个边缘概率向量填出独立联合分布（每行 = 各变量边缘概率之积） */
export function independentWeights(n: number, marginals: number[]): number[] {
  const total = 1 << n;
  const weights: number[] = [];
  for (let row = 0; row < total; row += 1) {
    let weight = 1;
    for (let j = 0; j < n; j += 1) {
      const p = Math.min(1, Math.max(0, marginals[j] ?? 0.5));
      weight *= bitAt(row, n, j) === 1 ? p : 1 - p;
    }
    weights.push(weight);
  }
  return weights;
}

export function analyzeJoint(fn: BooleanFunction, weights: number[]): JointAnalysis {
  const n = fn.variables.length;
  const total = 1 << n;
  const normalized = normalizeJoint(weights.slice(0, total));
  const rows: JointRow[] = [];
  let p1 = 0;
  let pDontCare = 0;

  for (let row = 0; row < total; row += 1) {
    const value = fn.values[row] ?? "X";
    rows.push({ index: row, value, weight: normalized[row] });
    if (value === 1) p1 += normalized[row];
    else if (value === "X") pDontCare += normalized[row];
  }

  const marginals = jointMarginals(normalized, n);

  // 独立模型的对照：边缘概率不变，只是假设彼此无关
  const total2 = total;
  let independentP1 = 0;
  for (let row = 0; row < total2; row += 1) {
    if (fn.values[row] !== 1) continue;
    let weight = 1;
    for (let j = 0; j < n; j += 1) {
      weight *= bitAt(row, n, j) === 1 ? marginals[j] : 1 - marginals[j];
    }
    independentP1 += weight;
  }

  const pairs: DependencePair[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let pBoth = 0;
      for (let row = 0; row < total; row += 1) {
        if (bitAt(row, n, i) === 1 && bitAt(row, n, j) === 1) pBoth += normalized[row];
      }
      const pProduct = marginals[i] * marginals[j];
      const delta = Math.abs(pBoth - pProduct);
      pairs.push({ i, j, pBoth, pProduct, delta, dependent: delta > 1e-9 });
    }
  }

  return {
    rows,
    p1,
    pDontCare,
    lowerBound: p1,
    upperBound: Math.min(1, p1 + pDontCare),
    marginals,
    independentP1,
    delta: p1 - independentP1,
    pairs,
    totalWeight: weights.reduce((acc, weight) => acc + (Number.isFinite(weight) && weight > 0 ? weight : 0), 0),
  };
}

/** 按权重抽一行（CDF + 线性扫描；2^n ≤ 64 时比二分更简单） */
export function sampleJointRow(weights: number[], rng: () => number): number {
  const normalized = normalizeJoint(weights);
  let u = rng();
  for (let row = 0; row < normalized.length; row += 1) {
    u -= normalized[row];
    if (u <= 0) return row;
  }
  return normalized.length - 1;
}

/**
 * 按联合分布做蒙特卡洛。与独立版共用同一个随机数发生器，
 * 因此同样的种子可以复现，也方便和独立模型对照。
 */
export function runJointSimulation(
  fn: BooleanFunction,
  weights: number[],
  trials: number,
  seed: number
): SimulationResult {
  const rng = mulberry32(seed);
  const normalized = normalizeJoint(weights.slice(0, 1 << fn.variables.length));
  const cdf: number[] = [];
  let acc = 0;
  for (const weight of normalized) {
    acc += weight;
    cdf.push(acc);
  }

  let ones = 0;
  const checkpoints: SimulationResult["checkpoints"] = [];
  const milestones: number[] = [];
  let m = 1;
  while (m < trials) {
    milestones.push(m);
    m = Math.max(m + 1, Math.ceil(m * 1.12));
  }
  milestones.push(trials);
  let nextMilestone = 0;

  for (let t = 0; t < trials; t += 1) {
    const u = rng();
    let row = cdf.length - 1;
    for (let i = 0; i < cdf.length; i += 1) {
      if (u < cdf[i]) {
        row = i;
        break;
      }
    }
    if (fn.values[row] === 1) ones += 1;

    if (nextMilestone < milestones.length && t + 1 >= milestones[nextMilestone]) {
      checkpoints.push({ trials: t + 1, ones, frequency: ones / (t + 1) });
      nextMilestone += 1;
    }
  }

  return {
    trials,
    ones,
    zeros: trials - ones,
    frequency: trials === 0 ? 0 : ones / trials,
    seed,
    checkpoints,
  };
}

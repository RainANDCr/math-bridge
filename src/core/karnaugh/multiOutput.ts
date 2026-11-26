import type { CellValue } from "../boolean/model";
import { enumerateCubes, termToString, type Cube } from "./implicants";
import { minimizeValues } from "./minimizer";

/**
 * 多输出共享化简
 *
 * 问题：几个输出共用同一组输入变量时，**同一个乘积项可以同时喂给多个输出**。
 * 各输出单独化简会得到「各自最优」，但总门数未必最少：
 * 一个 2 文字项被 3 个输出共用，只需要造一次。
 *
 * 做法：
 *   1. 枚举所有对「至少一个输出」合法的立方体（1 ∪ X）
 *   2. 每个立方体算出它能覆盖的 (输出, 最小项) 对
 *   3. 剔除被支配的立方体（覆盖是别人的子集，成本却不更低）
 *   4. 分支限界选一组立方体覆盖全部 (输出, 1)，目标是最小化
 *      Σ(文字数 + 1) —— 文字数是与门输入数，+1 代表这个乘积项本身的代价
 *
 * 与单输出化简共用同一套 base/mask 立方体表示，结论可以互相验证。
 */

export interface OutputSpec {
  name: string;
  values: CellValue[];
}

export interface SharedTerm {
  cube: Cube;
  expression: string;
  /** 该乘积项服务的输出下标 */
  outputs: number[];
  /** coverage[i] = 在输出 i 上覆盖的、必须为 1 的最小项（不含 X） */
  coverage: number[][];
}

export interface MultiOutputResult {
  terms: SharedTerm[];
  totalLiterals: number;
  totalTerms: number;
  sharedTerms: number;
  perOutput: Array<{ name: string; expression: string; literals: number; terms: number }>;
  independent: { literals: number; terms: number; expressions: string[] };
  savings: number;
  isValid: boolean;
  notes: string[];
  nodeLimitHit: boolean;
}

const NODE_LIMIT = 200_000;

interface Candidate {
  cube: Cube;
  outputs: number[];
  coverage: number[][];
  pairs: number[];
  pairSet: Set<number>;
  literals: number;
  cost: number;
}

function buildCandidates(
  variables: string[],
  specs: OutputSpec[]
): Candidate[] {
  const total = 1 << variables.length;
  const union = new Set<number>();
  for (const spec of specs) {
    spec.values.forEach((value, index) => {
      if (value === 1 || value === "X") union.add(index);
    });
  }

  const raw: Candidate[] = [];
  for (const cube of enumerateCubes(variables, union)) {
    const outputs: number[] = [];
    const coverage: number[][] = [];
    const pairs: number[] = [];

    for (let o = 0; o < specs.length; o += 1) {
      const values = specs[o].values;
      let allowed = true;
      const ones: number[] = [];
      for (const cell of cube.cells) {
        const value = values[cell];
        if (value === 1) ones.push(cell);
        else if (value !== "X") {
          allowed = false;
          break;
        }
      }
      if (!allowed || ones.length === 0) continue;
      outputs.push(o);
      coverage.push(ones);
      for (const m of ones) pairs.push(o * total + m);
    }

    if (outputs.length === 0) continue;
    raw.push({
      cube,
      outputs,
      coverage,
      pairs,
      pairSet: new Set(pairs),
      literals: cube.literals.length,
      cost: cube.literals.length + 1,
    });
  }

  // 支配剪枝：覆盖是超集且成本不更高 → 被支配者永远不会更优
  const byCoverage = [...raw].sort(
    (a, b) => b.pairs.length - a.pairs.length || a.cost - b.cost
  );
  const kept: Candidate[] = [];
  for (const candidate of byCoverage) {
    const dominated = kept.some(
      (other) =>
        other.cost <= candidate.cost && candidate.pairs.every((p) => other.pairSet.has(p))
    );
    if (!dominated) kept.push(candidate);
  }
  return kept;
}

function greedyPick(candidates: Candidate[], allPairs: number[]): number[] {
  const covered = new Set<number>();
  const picks: number[] = [];
  const used = new Set<number>();
  while (covered.size < allPairs.length) {
    let bestIndex = -1;
    let bestScore = -1;
    let bestGain = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      if (used.has(i)) continue;
      let gain = 0;
      for (const p of candidates[i].pairs) if (!covered.has(p)) gain += 1;
      if (gain === 0) continue;
      const score = gain / candidates[i].cost;
      if (score > bestScore || (score === bestScore && gain > bestGain)) {
        bestIndex = i;
        bestScore = score;
        bestGain = gain;
      }
    }
    if (bestIndex < 0) break;
    used.add(bestIndex);
    picks.push(bestIndex);
    for (const p of candidates[bestIndex].pairs) covered.add(p);
  }
  return picks;
}

export function minimizeMultiOutput(
  variables: string[],
  specs: OutputSpec[]
): MultiOutputResult {
  const n = variables.length;
  const total = 1 << n;
  const notes: string[] = [];

  const independentParts = specs.map((spec) =>
    n > 0
      ? minimizeValues(variables, spec.values)
      : { expression: spec.values[0] === 1 ? "1" : "0", literalCount: 0, termCount: 0, terms: [] }
  );

  const independent = {
    literals: independentParts.reduce((acc, part) => acc + part.literalCount, 0),
    terms: independentParts.reduce((acc, part) => acc + part.termCount, 0),
    expressions: independentParts.map((part, i) =>
      `F${i + 1} = ${part.expression}`
    ),
  };

  const allPairs: number[] = [];
  for (let o = 0; o < specs.length; o += 1) {
    for (let m = 0; m < total; m += 1) {
      if (specs[o].values[m] === 1) allPairs.push(o * total + m);
    }
  }

  if (allPairs.length === 0) {
    return {
      terms: [],
      totalLiterals: 0,
      totalTerms: 0,
      sharedTerms: 0,
      perOutput: specs.map((spec, i) => ({
        name: spec.name || `F${i + 1}`,
        expression: "0",
        literals: 0,
        terms: 0,
      })),
      independent,
      savings: independent.literals,
      isValid: true,
      notes: ["所有输出都是常量 0"],
      nodeLimitHit: false,
    };
  }

  const candidates = buildCandidates(variables, specs);
  if (candidates.length === 0) {
    return {
      terms: [],
      totalLiterals: 0,
      totalTerms: 0,
      sharedTerms: 0,
      perOutput: specs.map((spec, i) => ({
        name: spec.name || `F${i + 1}`,
        expression: "—",
        literals: 0,
        terms: 0,
      })),
      independent,
      savings: 0,
      isValid: false,
      notes: ["内部错误：没有找到任何合法乘积项"],
      nodeLimitHit: false,
    };
  }

  // 每个 (输出, 最小项) 的可选乘积项
  const covering = new Map<number, number[]>();
  candidates.forEach((candidate, index) => {
    for (const pair of candidate.pairs) {
      const list = covering.get(pair);
      if (list) list.push(index);
      else covering.set(pair, [index]);
    }
  });

  let bestPicks = greedyPick(candidates, allPairs);
  let bestCost = bestPicks.reduce((acc, i) => acc + candidates[i].cost, 0);

  const maxRatio = Math.max(
    ...candidates.map((candidate) => candidate.pairs.length / candidate.cost)
  );

  const covered = new Set<number>();
  const chosen: number[] = [];
  let cost = 0;
  let nodes = 0;
  let nodeLimitHit = false;

  const orderedCovering = new Map<number, number[]>();
  for (const [pair, list] of covering) {
    orderedCovering.set(
      pair,
      [...list].sort(
        (a, b) =>
          candidates[b].pairs.length - candidates[a].pairs.length ||
          candidates[a].cost - candidates[b].cost
      )
    );
  }

  const dfs = (): void => {
    if (covered.size === allPairs.length) {
      if (cost < bestCost || (cost === bestCost && chosen.length < bestPicks.length)) {
        bestCost = cost;
        bestPicks = [...chosen];
      }
      return;
    }
    nodes += 1;
    if (nodes > NODE_LIMIT) {
      nodeLimitHit = true;
      return;
    }

    const remaining = allPairs.length - covered.size;
    if (cost + remaining / maxRatio > bestCost) return;

    // MRV：挑可选乘积项最少的未覆盖对
    let target = -1;
    let targetOptions: number[] | null = null;
    for (const pair of allPairs) {
      if (covered.has(pair)) continue;
      const options = orderedCovering.get(pair) ?? [];
      if (!targetOptions || options.length < targetOptions.length) {
        target = pair;
        targetOptions = options;
      }
      if (options.length <= 1) break;
    }
    if (target < 0 || !targetOptions || targetOptions.length === 0) return;

    for (const index of targetOptions) {
      if (chosen.includes(index)) continue;
      const candidate = candidates[index];
      if (cost + candidate.cost > bestCost) continue;

      const added: number[] = [];
      for (const pair of candidate.pairs) {
        if (!covered.has(pair)) {
          covered.add(pair);
          added.push(pair);
        }
      }
      chosen.push(index);
      cost += candidate.cost;

      dfs();

      cost -= candidate.cost;
      chosen.pop();
      for (const pair of added) covered.delete(pair);
      if (nodeLimitHit) return;
    }
  };

  dfs();

  const terms: SharedTerm[] = bestPicks
    .map((index) => candidates[index])
    .sort(
      (a, b) =>
        b.cube.size - a.cube.size ||
        b.outputs.length - a.outputs.length ||
        a.cube.base - b.cube.base
    )
    .map((candidate) => ({
      cube: candidate.cube,
      expression: termToString(candidate.cube.literals),
      outputs: candidate.outputs,
      coverage: candidate.coverage,
    }));

  const totalLiterals = terms.reduce((acc, term) => acc + term.cube.literals.length, 0);

  const perOutput = specs.map((spec, o) => {
    const own = terms.filter((term) => term.outputs.includes(o));
    const literalCount = own.reduce((acc, term) => acc + term.cube.literals.length, 0);
    const expression =
      own.length === 0
        ? "0"
        : own.some((term) => term.cube.literals.length === 0)
        ? "1"
        : own.map((term) => term.expression).join(" + ");
    return {
      name: spec.name || `F${o + 1}`,
      expression,
      literals: literalCount,
      terms: own.length,
    };
  });

  const coveredPairs = new Set<number>();
  for (const term of terms) {
    term.outputs.forEach((o, index) => {
      for (const cell of term.coverage[index]) coveredPairs.add(o * total + cell);
    });
  }
  const isValid = allPairs.every((pair) => coveredPairs.has(pair));

  if (nodeLimitHit) {
    notes.push("搜索达到节点上限，当前结果可能不是全局最优（已给出可行解）");
  } else {
    notes.push("已穷举搜索全部覆盖组合，结果是全局最优（按总代价最小）");
  }
  if (!isValid) notes.push("有必须覆盖的 1 没有被任何乘积项覆盖");

  return {
    terms,
    totalLiterals,
    totalTerms: terms.length,
    sharedTerms: terms.filter((term) => term.outputs.length > 1).length,
    perOutput,
    independent,
    savings: independent.literals - totalLiterals,
    isValid,
    notes,
    nodeLimitHit,
  };
}

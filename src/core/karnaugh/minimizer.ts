import type { CellValue } from "../boolean/model";
import {
  buildCube,
  clauseToString,
  cubeContains,
  primeImplicants,
  termToString,
  type Cube,
  type Literal,
} from "./implicants";

/**
 * SOP / POS 最小化
 *
 * 算法（对 2–6 变量都是精确解，不是贪心近似）：
 *   1. 枚举全部 3^n 个立方体，保留完全落在「1 ∪ X」内的合法蕴含项
 *   2. 取出素蕴含项（不能被更大合法立方体包含的）
 *   3. 选出「每个 1 格只被它覆盖一次」的必需素蕴含项
 *   4. 对剩余格子做分支限界搜索（exact cover），目标按
 *      （乘积项个数, 文字总数）字典序最小
 *
 * 分支限界带节点上限，命中上限时会在 notes 中明确说明，
 * 不会把近似结果伪装成最优解。
 */

export interface SolutionSummary {
  terms: Cube[];
  expression: string;
}

export interface MinimizeResult {
  terms: Cube[];
  expression: string;
  termCount: number;
  literalCount: number;
  essentialCount: number;
  isValid: boolean;
  uncovered: number[];
  alternatives: SolutionSummary[];
  notes: string[];
  nodeLimitHit: boolean;
}

export interface PosClause {
  /** 对应的 0 格分组立方体 */
  cube: Cube;
  /** 该分组的乘积项文字（用于解释） */
  productLiterals: Literal[];
  /** 和项中的文字（即乘积项文字取反） */
  clauseLiterals: Literal[];
  text: string;
}

export interface PosResult {
  clauses: PosClause[];
  expression: string;
  clauseCount: number;
  literalCount: number;
  isValid: boolean;
  notes: string[];
}

const NODE_LIMIT = 200_000;

function literalHolds(literal: Literal, index: number, variables: string[]): boolean {
  const pos = variables.indexOf(literal.variable);
  if (pos < 0) return true;
  const bit = ((index >> (variables.length - 1 - pos)) & 1) === 1;
  return literal.negated ? !bit : bit;
}

export function evaluateSopAt(variables: string[], terms: Cube[], index: number): boolean {
  return terms.some((term) =>
    term.literals.every((literal) => literalHolds(literal, index, variables))
  );
}

export function evaluatePosAt(variables: string[], clauses: PosClause[], index: number): boolean {
  return clauses.every((clause) =>
    clause.clauseLiterals.some((literal) => literalHolds(literal, index, variables))
  );
}

function sortTerms(terms: Cube[]): Cube[] {
  return [...terms].sort((a, b) => (b.size - a.size) || (a.base - b.base));
}

function expressionOf(terms: Cube[]): string {
  if (terms.length === 0) return "0";
  if (terms.length === 1 && terms[0].literals.length === 0) return "1";
  return terms.map((t) => termToString(t.literals)).join(" + ");
}

interface Cover {
  picks: number[];
  terms: number;
  literals: number;
}

function greedyCover(
  primes: Cube[],
  covers: number[][],
  targetCount: number
): Cover {
  const covered = new Array<boolean>(targetCount).fill(false);
  const picks: number[] = [];
  let remaining = targetCount;

  while (remaining > 0) {
    let bestIdx = -1;
    let bestGain = 0;
    let bestLiterals = Number.POSITIVE_INFINITY;
    for (let p = 0; p < primes.length; p += 1) {
      let gain = 0;
      for (const t of covers[p]) if (!covered[t]) gain += 1;
      if (gain === 0) continue;
      const literals = primes[p].literals.length;
      if (gain > bestGain || (gain === bestGain && literals < bestLiterals)) {
        bestIdx = p;
        bestGain = gain;
        bestLiterals = literals;
      }
    }
    if (bestIdx < 0) break;
    picks.push(bestIdx);
    for (const t of covers[bestIdx]) {
      if (!covered[t]) {
        covered[t] = true;
        remaining -= 1;
      }
    }
  }

  const literals = picks.reduce((acc, p) => acc + primes[p].literals.length, 0);
  return { picks, terms: picks.length, literals };
}

/**
 * 核心：给定变量与输出向量（可含 X），求最小 SOP。
 */
export function minimizeValues(
  variables: string[],
  values: CellValue[],
  options: { maxAlternatives?: number } = {}
): MinimizeResult {
  const n = variables.length;
  const total = 1 << n;
  const notes: string[] = [];
  const maxAlternatives = options.maxAlternatives ?? 2;

  if (n === 0) {
    const v = values[0];
    return {
      terms: [],
      expression: v === 1 ? "1" : "0",
      termCount: v === 1 ? 1 : 0,
      literalCount: 0,
      essentialCount: 0,
      isValid: true,
      uncovered: [],
      alternatives: [],
      notes: ["常量函数"],
      nodeLimitHit: false,
    };
  }

  const on: number[] = [];
  const allowed = new Set<number>();
  for (let i = 0; i < total; i += 1) {
    const v = values[i];
    if (v === 1) {
      on.push(i);
      allowed.add(i);
    } else if (v === "X") {
      allowed.add(i);
    }
  }

  if (on.length === 0) {
    return {
      terms: [],
      expression: "0",
      termCount: 0,
      literalCount: 0,
      essentialCount: 0,
      isValid: true,
      uncovered: [],
      alternatives: [],
      notes: ["没有任何输出为 1 的格子，最简式就是常量 0"],
      nodeLimitHit: false,
    };
  }

  const primes = primeImplicants(variables, allowed);
  if (primes.length === 0) {
    // 理论上不会发生：每个 1 格自身就是合法立方体
    return {
      terms: [],
      expression: "0",
      termCount: 0,
      literalCount: 0,
      essentialCount: 0,
      isValid: false,
      uncovered: on,
      alternatives: [],
      notes: ["内部错误：未找到任何合法蕴含项"],
      nodeLimitHit: false,
    };
  }

  const targetIndex = new Map<number, number>();
  on.forEach((m, i) => targetIndex.set(m, i));

  const covers = primes.map((p) => {
    const list: number[] = [];
    for (const cell of p.cells) {
      const t = targetIndex.get(cell);
      if (t !== undefined) list.push(t);
    }
    return list;
  });

  const candidatesFor: number[][] = Array.from({ length: on.length }, () => []);
  covers.forEach((list, p) => {
    for (const t of list) candidatesFor[t].push(p);
  });

  // —— 必需素蕴含项 ——
  const essential = new Set<number>();
  for (let t = 0; t < on.length; t += 1) {
    const candidates = candidatesFor[t];
    if (candidates.length === 0) {
      return {
        terms: [],
        expression: "0",
        termCount: 0,
        literalCount: 0,
        essentialCount: 0,
        isValid: false,
        uncovered: [on[t]],
        alternatives: [],
        notes: [`最小项 m${on[t]} 无法被任何合法分组覆盖`],
        nodeLimitHit: false,
      };
    }
    if (candidates.length === 1) essential.add(candidates[0]);
  }

  let best: Cover = greedyCover(primes, covers, on.length);
  const greedyTerms = best.terms;
  const greedyLiterals = best.literals;

  const alternatives = new Map<string, number[]>();
  let nodes = 0;
  let nodeLimitHit = false;

  const covered = new Array<boolean>(on.length).fill(false);
  const chosen: number[] = [];
  let literalSum = 0;

  for (const p of essential) {
    chosen.push(p);
    literalSum += primes[p].literals.length;
    for (const t of covers[p]) covered[t] = true;
  }

  const remainingAfterEssential = covered.some((c) => !c);
  if (!remainingAfterEssential) {
    // 必需项已经覆盖全部 1 格
    const literals = chosen.reduce((acc, p) => acc + primes[p].literals.length, 0);
    if (chosen.length < best.terms || (chosen.length === best.terms && literals < best.literals)) {
      best = { picks: [...chosen], terms: chosen.length, literals };
    }
  }

  const dfs = (): void => {
    if (nodes > NODE_LIMIT) {
      nodeLimitHit = true;
      return;
    }
    nodes += 1;

    let target = -1;
    let options: number[] | null = null;

    for (let t = 0; t < on.length; t += 1) {
      if (covered[t]) continue;
      const candidates = candidatesFor[t];
      if (!options || candidates.length < options.length) {
        target = t;
        options = candidates;
      }
      if (options.length === 1) break;
    }

    if (target === -1 || !options) {
      if (chosen.length < best.terms || (chosen.length === best.terms && literalSum < best.literals)) {
        best = { picks: [...chosen], terms: chosen.length, literals: literalSum };
        alternatives.clear();
      } else if (chosen.length === best.terms && literalSum === best.literals) {
        const sig = [...chosen].sort((a, b) => a - b).join(",");
        if (alternatives.size < maxAlternatives + 2) alternatives.set(sig, [...chosen]);
      }
      return;
    }

    const ordered = [...options].sort((a, b) => {
      const gainA = covers[a].reduce((acc, t) => acc + (covered[t] ? 0 : 1), 0);
      const gainB = covers[b].reduce((acc, t) => acc + (covered[t] ? 0 : 1), 0);
      if (gainA !== gainB) return gainB - gainA;
      return primes[a].literals.length - primes[b].literals.length;
    });

    for (const p of ordered) {
      if (chosen.length + 1 > best.terms) continue;
      chosen.push(p);
      literalSum += primes[p].literals.length;
      const touched: number[] = [];
      for (const t of covers[p]) {
        if (!covered[t]) {
          covered[t] = true;
          touched.push(t);
        }
      }
      dfs();
      for (const t of touched) covered[t] = false;
      literalSum -= primes[p].literals.length;
      chosen.pop();
      if (nodeLimitHit) return;
    }
  };

  dfs();

  const pickedTerms = best.picks.map((p) => primes[p]);
  const sorted = sortTerms(pickedTerms);
  const uncovered: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (values[i] !== 1) continue;
    if (!evaluateSopAt(variables, sorted, i)) uncovered.push(i);
  }

  const essentialInResult = best.picks.filter((p) => essential.has(p)).length;

  if (uncovered.length > 0) {
    notes.push(`有 ${uncovered.length} 个 1 格没有被覆盖（${uncovered.join(", ")}）`);
  }
  if (greedyTerms !== best.terms || greedyLiterals !== best.literals) {
    notes.push(
      `搜索把初始贪心解从 ${greedyTerms} 项 / ${greedyLiterals} 文字改进为 ${best.terms} 项 / ${best.literals} 文字`
    );
  }
  if (nodeLimitHit) {
    notes.push("搜索达到节点上限，当前结果可能不是全局最优，请反馈该表达式以便优化算法");
  } else {
    notes.push("已穷举搜索全部覆盖组合，结果是全局最优（按项数优先、文字数次优）");
  }

  const altSummaries: SolutionSummary[] = [];
  const bestSig = [...best.picks].sort((a, b) => a - b).join(",");
  for (const [sig, picks] of alternatives) {
    if (sig === bestSig) continue;
    const terms = sortTerms(picks.map((p) => primes[p]));
    altSummaries.push({ terms, expression: expressionOf(terms) });
    if (altSummaries.length >= maxAlternatives) break;
  }

  return {
    terms: sorted,
    expression: expressionOf(sorted),
    termCount: sorted.length,
    literalCount: sorted.reduce((acc, t) => acc + t.literals.length, 0),
    essentialCount: essentialInResult,
    isValid: uncovered.length === 0,
    uncovered,
    alternatives: altSummaries,
    notes,
    nodeLimitHit,
  };
}

/**
 * POS（和之积）：
 * 对「0 格（含 X）」求最小 SOP，再用德摩根定律把每个乘积项取反成和项。
 * 这样 POS 与 SOP 用的是同一套经过验证的算法，不会出现两套逻辑。
 */
export function minimizePosValues(
  variables: string[],
  values: CellValue[]
): PosResult {
  const n = variables.length;
  const total = 1 << n;

  if (n === 0) {
    const v = values[0];
    return {
      clauses: [],
      expression: v === 0 ? "0" : "1",
      clauseCount: v === 0 ? 1 : 0,
      literalCount: 0,
      isValid: true,
      notes: ["常量函数"],
    };
  }

  const zeroCount = values.filter((v) => v === 0).length;
  if (zeroCount === 0) {
    return {
      clauses: [],
      expression: "1",
      clauseCount: 0,
      literalCount: 0,
      isValid: true,
      notes: ["没有输出为 0 的格子，POS 为常量 1"],
    };
  }
  if (zeroCount === total) {
    return {
      clauses: [],
      expression: "0",
      clauseCount: 1,
      literalCount: 0,
      isValid: true,
      notes: ["所有格子都为 0，POS 为常量 0"],
    };
  }

  const complemented: CellValue[] = values.map((v) => (v === "X" ? "X" : v === 1 ? 0 : 1));
  const result = minimizeValues(variables, complemented, { maxAlternatives: 0 });

  const clauses: PosClause[] = result.terms.map((cube) => {
    const clauseLiterals = cube.literals.map((l) => ({
      variable: l.variable,
      negated: !l.negated,
    }));
    return {
      cube,
      productLiterals: cube.literals,
      clauseLiterals,
      text: clauseToString(cube.literals),
    };
  });

  let valid = true;
  for (let i = 0; i < total; i += 1) {
    if (values[i] === "X") continue;
    const expected = values[i] === 1;
    if (evaluatePosAt(variables, clauses, i) !== expected) {
      valid = false;
      break;
    }
  }

  return {
    clauses,
    expression: clauses.map((c) => c.text).join("·"),
    clauseCount: clauses.length,
    literalCount: clauses.reduce((acc, c) => acc + c.clauseLiterals.length, 0),
    isValid: valid,
    notes: ["POS 由对 0 格分组后取反得到，与 SOP 共用同一套精确覆盖算法"],
  };
}

export interface GroupExplanation {
  minterms: number[];
  changed: string[];
  kept: Array<{ variable: string; value: 0 | 1 }>;
  implicant: string;
  text: string;
}

export function explainGroup(cube: Cube, variables: string[]): GroupExplanation {
  const n = variables.length;
  const changed: string[] = [];
  const kept: Array<{ variable: string; value: 0 | 1 }> = [];
  for (let i = 0; i < n; i += 1) {
    const bit = n - 1 - i;
    if ((cube.mask >> bit) & 1) {
      kept.push({ variable: variables[i], value: ((cube.base >> bit) & 1) === 1 ? 1 : 0 });
    } else {
      changed.push(variables[i]);
    }
  }
  const keptText = kept.length
    ? kept.map(({ variable, value }) => `${variable}=${value}`).join("、")
    : "没有变量保持不变";
  const changedText = changed.length ? changed.join("、") : "无";
  return {
    minterms: cube.cells,
    changed,
    kept,
    implicant: termToString(cube.literals),
    text: `${keptText}，这些值在组内始终不变，故保留；${changedText} 在组内取值变化，故消去。`,
  };
}

/** 组合两个立方体，判断是否可以合并（教学演示用） */
export function mergeCubes(a: Cube, b: Cube, variables: string[]): Cube | null {
  const diff = a.base ^ b.base;
  if (a.mask !== b.mask) return null;
  if ((diff & (diff - 1)) !== 0) return null;
  const mask = a.mask & ~diff;
  if (popcountOf(mask) !== popcountOf(a.mask) - 1) return null;
  return buildCube(a.base & mask, mask, variables);
}

function popcountOf(value: number): number {
  let v = value;
  let count = 0;
  while (v) {
    v &= v - 1;
    count += 1;
  }
  return count;
}

/** 供 UI 判断某个疑似更大的立方体是否包含当前项（用于高亮重叠） */
export function overlaps(a: Cube, b: Cube): boolean {
  return cubeContains(a, b) || cubeContains(b, a) || a.cells.some((c) => b.cells.includes(c));
}

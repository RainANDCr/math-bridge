import type { CellValue } from "../boolean/model";
import { buildCube, clauseToString, termToString, type Cube } from "./implicants";

/**
 * 组合电路的静态冒险分析
 *
 * 冒险不是「函数错了」，而是「函数对了，但输出在输入变化的一瞬间抖了一下」。
 * 两个相邻的 1 格如果被两个不同的乘积项分别覆盖、又没有一项同时覆盖它们，
 * 那么当那一位输入变化时，前一项已经失效、后一项还没建立，输出会出现一个窄脉冲 ——
 * 这就是静态-1 冒险。0 格侧同理，对应 POS 的静态-0 冒险。
 *
 * 判据只有一条：**相邻两个同值格，是否存在一个立方体同时覆盖它们**。
 * 没有，就有冒险。所以检测不需要模拟延迟，纯粹是覆盖关系。
 *
 * 修复用共识定理：若两项 P、Q 只差一个文字（x 与 ¬x），则 P + Q = P + Q + consensus(P,Q)，
 * 而 consensus 恰好同时覆盖这一对相邻格。两项差的文字不止一个时，退化为「这两格的
 * 最小覆盖」—— 同样能消掉这一处冒险，只是代价更大。
 *
 * 不在检测范围：功能冒险（输入同时变多位、且变化前后函数值不同）与动态冒险
 * （需要 3 条以上不同延迟的路径）。前者靠增加项消不掉，后者要有时延模型。
 */

export interface StaticHazard {
  /** 相邻的两个格子（minterm 编号，小的在前） */
  cells: [number, number];
  /** 变化的那一位变量名 */
  variable: string;
  variableIndex: number;
  /** 分别覆盖两格、且互不覆盖的项下标 */
  terms: [number, number];
}

export interface HazardRepair {
  /** 修复后的覆盖 */
  terms: Cube[];
  /** 为消除冒险而新增的项 */
  added: Cube[];
  expression: string;
  termCount: number;
  literalCount: number;
  /** 新增项带来的文字数代价 */
  addedLiterals: number;
}

export interface HazardReport {
  /** 1 表示 SOP 的静态-1 冒险，0 表示 POS 的静态-0 冒险 */
  target: 0 | 1;
  hazards: StaticHazard[];
  /** 检查过的相邻同值格对数 */
  checkedPairs: number;
  repair: HazardRepair;
}

export interface HazardAnalysis {
  variables: string[];
  ones: HazardReport;
  zeros: HazardReport;
  hasHazards: boolean;
}

function popcount(value: number): number {
  let v = value;
  let count = 0;
  while (v) {
    v &= v - 1;
    count += 1;
  }
  return count;
}

function cubeCovers(cube: Cube, cell: number): boolean {
  return cube.cells.includes(cell);
}

/** 只差一个文字时返回共识项，否则返回 null */
function consensusOf(a: Cube, b: Cube, variables: string[]): Cube | null {
  if (a.mask !== b.mask) return null;
  const diff = a.base ^ b.base;
  if (diff === 0 || popcount(diff) !== 1) return null;
  return buildCube(a.base & ~diff, a.mask & ~diff, variables);
}

/** 同时覆盖两个相邻格的最小立方体（两项差的文字多于一个时兜底） */
function bridgeCube(a: number, b: number, variables: string[]): Cube {
  const n = variables.length;
  const diff = a ^ b;
  const full = (1 << n) - 1;
  const mask = full & ~diff;
  return buildCube(a & mask, mask, variables);
}

/**
 * 找出所有静态冒险对。
 *
 * 只看「值为 target 的格子」：无关项（X）既不是 1 也不是 0，
 * 经过它的变化属于功能冒险，不是这里能修的静态冒险。
 */
function detect(
  variables: string[],
  values: CellValue[],
  terms: Cube[],
  target: 0 | 1
): { hazards: StaticHazard[]; checkedPairs: number } {
  const n = variables.length;
  const total = 1 << n;
  const onSet = new Set<number>();
  for (let i = 0; i < total; i += 1) if (values[i] === target) onSet.add(i);

  const hazards: StaticHazard[] = [];
  const seen = new Set<string>();
  let checkedPairs = 0;

  for (let cell = 0; cell < total; cell += 1) {
    if (!onSet.has(cell)) continue;
    for (let bit = 0; bit < n; bit += 1) {
      const neighbour = cell ^ (1 << bit);
      if (!onSet.has(neighbour) || neighbour < cell) continue;
      checkedPairs += 1;

      const coverCell = terms
        .map((term, index) => (cubeCovers(term, cell) ? index : -1))
        .filter((index) => index >= 0);
      const coverNeighbour = terms
        .map((term, index) => (cubeCovers(term, neighbour) ? index : -1))
        .filter((index) => index >= 0);

      // 覆盖不完整时无法归因（例如调用方只传了部分项），跳过而不是崩溃
      if (coverCell.length === 0 || coverNeighbour.length === 0) continue;

      // 有任何一项同时覆盖两格，这一段变化就是安全的
      const shared = coverCell.filter((index) => coverNeighbour.includes(index));
      if (shared.length > 0) continue;

      const key = `${cell}-${neighbour}`;
      if (seen.has(key)) continue;
      seen.add(key);

      hazards.push({
        cells: [cell, neighbour],
        variable: variables[n - 1 - bit],
        variableIndex: n - 1 - bit,
        terms: [coverCell[0], coverNeighbour[0]],
      });
    }
  }

  return { hazards, checkedPairs };
}

function repairCover(
  variables: string[],
  values: CellValue[],
  terms: Cube[],
  target: 0 | 1
): { terms: Cube[]; added: Cube[] } {
  const current = terms.map((term) => term);
  const added: Cube[] = [];
  const guard = 64;

  for (let round = 0; round < guard; round += 1) {
    const { hazards } = detect(variables, values, current, target);
    if (hazards.length === 0) break;

    const hazard = hazards[0];
    const [a, b] = hazard.cells;
    const patch =
      consensusOf(current[hazard.terms[0]], current[hazard.terms[1]], variables) ??
      bridgeCube(a, b, variables);

    // 已经有项覆盖这两格时不应再走到这里；防御性检查避免重复添加同一个立方体
    if (current.some((term) => cubeCovers(term, a) && cubeCovers(term, b))) continue;
    if (current.some((term) => term.base === patch.base && term.mask === patch.mask)) continue;

    current.push(patch);
    added.push(patch);
  }

  return { terms: current, added };
}

function formatCover(terms: Cube[], target: 0 | 1): string {
  if (terms.length === 0) return target === 1 ? "0" : "1";
  if (target === 1) {
    return terms
      .map((term) => termToString(term.literals))
      .join(" + ");
  }
  // clauseToString 自己会把文字取反（正的写成 ¬x），这里不能再取反一次
  return terms.map((term) => clauseToString(term.literals)).join("·");
}

function reportFor(
  variables: string[],
  values: CellValue[],
  terms: Cube[],
  target: 0 | 1
): HazardReport {
  const { hazards, checkedPairs } = detect(variables, values, terms, target);
  const { terms: repaired, added } = repairCover(variables, values, terms, target);
  return {
    target,
    hazards,
    checkedPairs,
    repair: {
      terms: repaired,
      added,
      expression: formatCover(repaired, target),
      termCount: repaired.length,
      literalCount: repaired.reduce((acc, term) => acc + term.literals.length, 0),
      addedLiterals: added.reduce((acc, term) => acc + term.literals.length, 0),
    },
  };
}

/**
 * 同时分析 SOP（静态-1）与 POS（静态-0）。
 *
 * `posCubes` 传 POS 的每个和项所对应的乘积立方体（即 0 格分组），
 * 内部按「0 格为 1」的互补函数复用同一套检测。
 */
export function analyzeHazards(
  variables: string[],
  values: CellValue[],
  sopTerms: Cube[],
  posCubes: Cube[]
): HazardAnalysis {
  // 两个方向都传原始真值，由 target 决定看 1 格还是 0 格 ——
  // 之前把「取反后的真值」配 target=0 传进来，等于查了反的那一半
  const ones = reportFor(variables, values, sopTerms, 1);
  const zeros = reportFor(variables, values, posCubes, 0);

  return {
    variables,
    ones,
    zeros,
    hasHazards: ones.hazards.length > 0 || zeros.hazards.length > 0,
  };
}

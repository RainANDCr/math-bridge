import type { CellValue } from "../boolean/model";
import { buildCube, clauseToString, popcount, type Cube } from "./implicants";

/**
 * Quine–McCluskey 逐步合并表
 *
 * 这是卡诺图的「表格版」：卡诺图上把两个相邻组圈在一起，
 * 在这张表里就是找出「只有一位不同」的两项，合并后把那位写成 -。
 * 两者枚举的是同一批素蕴含项（测试里用随机函数交叉验证）。
 *
 * 与 minimizer 的分工：
 *   - minimizer 负责「选哪几项覆盖全部 1」（精确覆盖 + 分支限界）
 *   - 本模块负责「这些项是怎么一步步合并出来的」（过程可读）
 * 二者共用同一套 base/mask 立方体表示，所以不会各说各话。
 */

export interface QmImplicant {
  /** base/mask 规范化后的唯一键 */
  key: string;
  base: number;
  /** 1 = 该位固定 */
  mask: number;
  /** 形如 "0-11"，高位在前，与变量顺序一致 */
  binary: string;
  /** 覆盖的全部格子（含 X） */
  cells: number[];
  /** 固定位中 1 的个数，用于按「1 的个数」分行 */
  onesCount: number;
  /** 对应的乘积项，如 "¬A·C" */
  expression: string;
  /** 取反后的和项，如 "(A + ¬C)"；POS 直接用它 */
  clause: string;
  /** 由多少个原始格子合并而来（1, 2, 4, ...） */
  sourceCount: number;
}

export interface QmMerge {
  a: string;
  b: string;
  to: string;
  /** 被消去的变量名 */
  variable: string;
}

export interface QmRound {
  round: number;
  groups: Array<{ ones: number; items: QmImplicant[] }>;
  merges: QmMerge[];
  /** 本轮不再参与合并的项 = 素蕴含项 */
  primes: QmImplicant[];
}

export interface QmChartRow {
  key: string;
  expression: string;
  clause: string;
  binary: string;
  size: number;
  covers: number[];
  essential: boolean;
  chosen: boolean;
}

export interface QmProcess {
  rounds: QmRound[];
  primes: QmImplicant[];
  columns: number[];
  rows: QmChartRow[];
  /** 只被一个素蕴含项覆盖的列（即必需项的证据） */
  essentialColumns: number[];
  mergeCount: number;
  note: string;
}

const keyOf = (base: number, mask: number) => `${base}/${mask}`;

function makeTerm(
  base: number,
  mask: number,
  n: number,
  variables: string[],
  sourceCount: number
): QmImplicant {
  const cube = buildCube(base, mask, variables);
  let binary = "";
  for (let bit = n - 1; bit >= 0; bit -= 1) {
    if (((cube.mask >> bit) & 1) === 0) binary += "-";
    else binary += ((cube.base >> bit) & 1) === 1 ? "1" : "0";
  }
  return {
    key: keyOf(cube.base, cube.mask),
    base: cube.base,
    mask: cube.mask,
    binary,
    cells: cube.cells,
    onesCount: popcount(cube.base & cube.mask),
    expression: cube.literals.length === 0 ? "1" : cube.literals
      .map((l) => `${l.negated ? "¬" : ""}${l.variable}`)
      .join("·"),
    clause: clauseToString(cube.literals),
    sourceCount,
  };
}

function mergePair(
  a: QmImplicant,
  b: QmImplicant
): { base: number; mask: number; diffBit: number } | null {
  if (a.mask !== b.mask) return null;
  const diff = (a.base ^ b.base) & a.mask;
  if (diff === 0) return null;
  if ((diff & (diff - 1)) !== 0) return null;
  return { base: a.base & ~diff, mask: a.mask & ~diff, diffBit: diff };
}

function groupByOnes(items: QmImplicant[]): QmRound["groups"] {
  const map = new Map<number, QmImplicant[]>();
  for (const item of items) {
    const list = map.get(item.onesCount);
    if (list) list.push(item);
    else map.set(item.onesCount, [item]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ones, group]) => ({
      ones,
      items: [...group].sort((x, y) => x.base - y.base || y.mask - x.mask),
    }));
}

/**
 * @param chosenTerms 最小化器实际选用的项，用于在覆盖表里标出「最终采用」
 */
export function quineMcCluskey(
  variables: string[],
  values: CellValue[],
  chosenTerms: Cube[] = []
): QmProcess {
  const n = variables.length;
  const total = 1 << n;

  if (n === 0 || total === 0) {
    return {
      rounds: [],
      primes: [],
      columns: [],
      rows: [],
      essentialColumns: [],
      mergeCount: 0,
      note: "常量函数，没有可合并的项",
    };
  }

  const fullMask = (1 << n) - 1;
  let current: QmImplicant[] = [];
  for (let i = 0; i < total; i += 1) {
    const v = values[i];
    if (v === 1 || v === "X") current.push(makeTerm(i, fullMask, n, variables, 1));
  }

  const rounds: QmRound[] = [];
  const primes: QmImplicant[] = [];
  let mergeCount = 0;
  let roundNo = 0;
  // 每轮 mask 至少少一位，最多 n 轮必然收敛；限制只作为防护
  while (current.length > 0 && roundNo <= n) {
    roundNo += 1;

    const mergedKeys = new Set<string>();
    const results = new Map<
      string,
      { base: number; mask: number; diffBit: number; a: QmImplicant; b: QmImplicant }
    >();
    // 同一结果可能由多对项合并得到，全部记录下来，避免表里出现「某项莫名消失」
    const pairs: Array<{ a: QmImplicant; b: QmImplicant; base: number; mask: number; diffBit: number }> = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < current.length; i += 1) {
      for (let j = i + 1; j < current.length; j += 1) {
        const a = current[i];
        const b = current[j];
        const merged = mergePair(a, b);
        if (!merged) continue;
        mergedKeys.add(a.key);
        mergedKeys.add(b.key);
        const pairKey = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          pairs.push({ ...merged, a, b });
        }
        const key = keyOf(merged.base, merged.mask);
        if (!results.has(key)) results.set(key, { ...merged, a, b });
      }
    }

    const primesThisRound = current.filter((item) => !mergedKeys.has(item.key));
    primes.push(...primesThisRound);

    const merges: QmMerge[] = [];
    const next: QmImplicant[] = [];
    for (const pair of pairs) {
      const bit = Math.round(Math.log2(pair.diffBit));
      merges.push({
        a: pair.a.binary,
        b: pair.b.binary,
        to: makeTerm(pair.base, pair.mask, n, variables, 1).binary,
        variable: variables[n - 1 - bit] ?? "?",
      });
    }
    for (const info of results.values()) {
      next.push(makeTerm(info.base, info.mask, n, variables, info.a.sourceCount * 2));
    }

    mergeCount += merges.length;
    rounds.push({
      round: roundNo,
      groups: groupByOnes(current),
      merges,
      primes: primesThisRound,
    });

    current = next;
  }

  const chosenKeys = new Set(chosenTerms.map((term) => keyOf(term.base & term.mask, term.mask)));

  const columns: number[] = [];
  for (let i = 0; i < total; i += 1) if (values[i] === 1) columns.push(i);

  const sortedPrimes = [...primes].sort(
    (a, b) => popcount(a.mask) - popcount(b.mask) || a.base - b.base
  );

  const coverCount = new Map<number, number>();
  for (const prime of sortedPrimes) {
    for (const cell of prime.cells) {
      if (values[cell] !== 1) continue;
      coverCount.set(cell, (coverCount.get(cell) ?? 0) + 1);
    }
  }

  const essentialColumns = columns.filter((m) => (coverCount.get(m) ?? 0) === 1);

  const rows: QmChartRow[] = sortedPrimes.map((prime) => ({
    key: prime.key,
    expression: prime.expression,
    clause: prime.clause,
    binary: prime.binary,
    size: prime.cells.length,
    covers: prime.cells.filter((cell) => values[cell] === 1),
    essential: prime.cells.some((cell) => essentialColumns.includes(cell)),
    chosen: chosenKeys.has(prime.key),
  }));

  const note =
    sortedPrimes.length === 0
      ? "没有输出为 1 的格子，不需要合并"
      : `共 ${rounds.length} 轮合并得到 ${sortedPrimes.length} 个素蕴含项，其中 ${rows.filter((r) => r.essential).length} 个是必需的`;

  return {
    rounds,
    primes: sortedPrimes,
    columns,
    rows,
    essentialColumns,
    mergeCount,
    note,
  };
}

import type { BooleanFunction } from "../boolean/model";

/**
 * 蕴含项（implicant）与立方体（cube）理论
 *
 * 关键建模：卡诺图上的一个 2^k 格分组，等价于一个「立方体」——
 * 一部分变量取固定值，其余变量自由变化。
 *   mask 的某一位为 1 表示该变量被固定，0 表示该变量被消去（don't care）。
 *
 * 这样，「相邻」就不需要特殊处理环绕：两个格子相邻 ⇔ 它们的编号只差一位。
 * 四角分组、跨边界分组都会自动成立。
 */

export interface Literal {
  variable: string;
  negated: boolean;
}

export interface Cube {
  /** 固定变量的取值（只 mask 为 1 的位有意义） */
  base: number;
  /** 1 = 该位固定 */
  mask: number;
  /** 覆盖的格子数 = 2^(n - popcount(mask)) */
  size: number;
  /** 覆盖的 minterm 编号，升序 */
  cells: number[];
  /** 该立方体对应的乘积项文字，按变量顺序 */
  literals: Literal[];
}

export function popcount(value: number): number {
  let count = 0;
  let v = value;
  while (v) {
    v &= v - 1;
    count += 1;
  }
  return count;
}

/** 位掩码 -> 所有组合 */
export function expandMask(mask: number, n: number): number[] {
  const free: number[] = [];
  for (let p = 0; p < n; p += 1) {
    if (((mask >> p) & 1) === 0) free.push(p);
  }
  const out: number[] = [];
  const combos = 1 << free.length;
  for (let i = 0; i < combos; i += 1) {
    let value = 0;
    for (let j = 0; j < free.length; j += 1) {
      if ((i >> j) & 1) value |= 1 << free[j];
    }
    out.push(value);
  }
  return out.sort((a, b) => a - b);
}

export function buildCube(
  base: number,
  mask: number,
  variables: string[]
): Cube {
  const n = variables.length;
  const cells = expandMask(mask, n).map((combo) => (base & mask) | combo);
  const literals: Literal[] = [];
  for (let i = 0; i < n; i += 1) {
    const bit = n - 1 - i;
    if ((mask >> bit) & 1) {
      literals.push({ variable: variables[i], negated: ((base >> bit) & 1) === 0 });
    }
  }
  return { base: base & mask, mask, size: cells.length, cells, literals };
}

/** outer 是否完整包含 inner */
export function cubeContains(outer: Cube, inner: Cube): boolean {
  return (
    (inner.mask & outer.mask) === outer.mask && (inner.base & outer.mask) === outer.base
  );
}

/**
 * 枚举全部「合法立方体」：所有 3^n 种（每位：固定 0 / 固定 1 / 自由）
 * 其中完全落在 allowed 集合内的那些。
 *
 * n=4 时只有 81 种，成本可忽略；因此这里不需要启发式。
 */
export function enumerateCubes(variables: string[], allowed: Set<number>): Cube[] {
  const n = variables.length;
  const totalStates = 3 ** n;
  const out: Cube[] = [];

  for (let state = 0; state < totalStates; state += 1) {
    let base = 0;
    let mask = 0;
    let rest = state;
    for (let i = 0; i < n; i += 1) {
      const digit = rest % 3;
      rest = Math.floor(rest / 3);
      const bit = n - 1 - i;
      if (digit !== 2) {
        mask |= 1 << bit;
        if (digit === 1) base |= 1 << bit;
      }
    }
    const cube = buildCube(base, mask, variables);
    if (cube.cells.every((c) => allowed.has(c))) out.push(cube);
  }
  return out;
}

/**
 * 素蕴含项（prime implicant）：
 * 合法立方体中，不能被更大的合法立方体包含的那些。
 * 最简 SOP 一定由素蕴含项组成，这是 Quine–McCluskey 的基本结论。
 */
export function primeImplicants(variables: string[], allowed: Set<number>): Cube[] {
  const valid = enumerateCubes(variables, allowed);
  const byMaskAsc = [...valid].sort((a, b) => a.size - b.size);
  const primes: Cube[] = [];
  for (const cube of valid) {
    const dominated = byMaskAsc.some(
      (other) => other.size > cube.size && cubeContains(other, cube)
    );
    if (!dominated) primes.push(cube);
  }
  return primes;
}

export interface CubeCheck {
  ok: boolean;
  cube: Cube | null;
  reason: string | null;
}

/**
 * 手动分组校验：把用户选中的一组格子翻译成立方体。
 *
 * 判定顺序（错误信息要按用户最容易理解的方式给出）：
 *   1. 空选择
 *   2. 格子数不是 2 的整数次幂
 *   3. 格子不构成一个「只差若干位」的矩形分组
 */
export function cubeFromCells(
  cells: number[],
  variables: string[],
  n: number
): CubeCheck {
  const unique = Array.from(new Set(cells)).sort((a, b) => a - b);
  if (unique.length === 0) {
    return { ok: false, cube: null, reason: "还没有选中任何格子" };
  }
  const isPowerOfTwo = (unique.length & (unique.length - 1)) === 0;
  if (!isPowerOfTwo) {
    return {
      ok: false,
      cube: null,
      reason: `分组大小必须是 2 的整数次幂（当前 ${unique.length} 格，应改为 1、2、4、8 格）`,
    };
  }

  let varying = 0;
  for (const cell of unique) varying |= cell ^ unique[0];
  const freeCount = popcount(varying);
  if (1 << freeCount !== unique.length) {
    return {
      ok: false,
      cube: null,
      reason: `所选 ${unique.length} 格在卡诺图上不相邻，不能构成一个矩形分组`,
    };
  }

  const fullMask = (1 << n) - 1;
  const mask = fullMask & ~varying;
  const base = unique[0] & mask;
  const cube = buildCube(base, mask, variables);
  const sameSet =
    cube.cells.length === unique.length &&
    cube.cells.every((c, i) => c === unique[i]);
  if (!sameSet) {
    return {
      ok: false,
      cube: null,
      reason: "所选格子不完整：矩形分组要求该范围内的格子全部选中",
    };
  }
  return { ok: true, cube, reason: null };
}

/** 乘积项的文字 -> 字符串，例如 A·¬B·C */
export function termToString(literals: Literal[]): string {
  if (literals.length === 0) return "1";
  return literals.map((l) => (l.negated ? `¬${l.variable}` : l.variable)).join("·");
}

/** 和项的文字（POS 用，文字取反） */
export function clauseToString(literals: Literal[]): string {
  if (literals.length === 0) return "0";
  return `(${literals.map((l) => (l.negated ? l.variable : `¬${l.variable}`)).join(" + ")})`;
}

/** 用输出向量反推：哪些变量在组内保持不变 */
export function groupExplanation(cube: Cube, variables: string[]): {
  changed: string[];
  kept: Array<{ variable: string; value: 0 | 1 }>;
  text: string;
} {
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
    : "没有任何变量保持不变";
  const changedText = changed.length ? changed.join("、") : "无";
  return {
    changed,
    kept,
    text: `${keptText}；${changedText} 在组内变化，可被消去`,
  };
}

/** 由函数构造「值为 1 或 X」的集合，用于枚举合法立方体 */
export function allowedSetOf(fn: BooleanFunction): Set<number> {
  const set = new Set<number>();
  fn.values.forEach((v, i) => {
    if (v === 1 || v === "X") set.add(i);
  });
  return set;
}

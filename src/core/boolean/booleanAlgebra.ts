import type { BooleanFunction, CellValue } from "./model";
import { valueAt } from "./model";

/**
 * 布尔代数工具：等价性验证、规范式生成
 *
 * 本项目的等价性检查一律采用「穷举真值表」的方式，
 * 不做符号化推导，因此结论是可复核的。
 */

export interface EquivalenceResult {
  equivalent: boolean;
  checkedRows: number;
  /** 忽略的无关项行（原始函数为 X） */
  skippedRows: number;
  mismatches: Array<{ index: number; a: CellValue; b: CellValue }>;
}

/**
 * 两个函数是否等价。
 * 只要有一方在某行是 X，该行即视为「不约束」，不计入不一致。
 */
export function areEquivalent(a: BooleanFunction, b: BooleanFunction): EquivalenceResult {
  const variables = Array.from(new Set([...a.variables, ...b.variables])).sort();
  const total = 1 << variables.length;
  const mismatches: EquivalenceResult["mismatches"] = [];
  let checked = 0;
  let skipped = 0;

  const indexOf = (vars: string[], index: number): number => {
    // 把宽变量集合的行号投影到目标变量集合
    let out = 0;
    for (const v of vars) {
      const posInUniverse = variables.indexOf(v);
      const bit = (index >> (variables.length - 1 - posInUniverse)) & 1;
      out = (out << 1) | bit;
    }
    return out;
  };

  for (let i = 0; i < total; i += 1) {
    const va = valueAt(a, indexOf(a.variables, i));
    const vb = valueAt(b, indexOf(b.variables, i));
    if (va === "X" || vb === "X") {
      skipped += 1;
      continue;
    }
    checked += 1;
    if (va !== vb) mismatches.push({ index: i, a: va, b: vb });
  }

  return { equivalent: mismatches.length === 0, checkedRows: checked, skippedRows: skipped, mismatches };
}

/** 判断某个输出向量在指定行是否与函数一致（允许 X 通配） */
export function compatibleAt(fn: BooleanFunction, index: number, expected: 0 | 1): boolean {
  const v = valueAt(fn, index);
  return v === "X" ? true : v === expected;
}

/**
 * 规范与或式（最小项之和），每个最小项写成完整文字形式。
 * 项数过多时返回 null，避免界面被超长公式撑破。
 */
export function canonicalSOP(fn: BooleanFunction, limit = 16): string | null {
  const terms: string[] = [];
  const n = fn.variables.length;
  for (let i = 0; i < fn.values.length; i += 1) {
    if (fn.values[i] !== 1) continue;
    if (terms.length >= limit) return null;
    const literals: string[] = [];
    for (let j = 0; j < n; j += 1) {
      const bit = (i >> (n - 1 - j)) & 1;
      literals.push(bit === 1 ? fn.variables[j] : `¬${fn.variables[j]}`);
    }
    terms.push(literals.length > 0 ? literals.join("·") : "1");
  }
  if (terms.length === 0) return "0";
  return terms.join(" + ");
}

/** 规范与或式对应的 Σm 记号 */
export function sigmaNotation(fn: BooleanFunction): string {
  const ms: number[] = [];
  fn.values.forEach((v, i) => {
    if (v === 1) ms.push(i);
  });
  return `Σm(${ms.join(",")})`;
}

/**
 * 用「文字列表」直接求值，供化简结果验证使用。
 * literal 用 {variable, negated} 表示。
 */
export function evaluateLiterals(
  variables: string[],
  literals: Array<{ variable: string; negated: boolean }>,
  index: number
): boolean {
  const n = variables.length;
  return literals.every(({ variable, negated }) => {
    const pos = variables.indexOf(variable);
    if (pos < 0) return true;
    const bit = ((index >> (n - 1 - pos)) & 1) === 1;
    return negated ? !bit : bit;
  });
}

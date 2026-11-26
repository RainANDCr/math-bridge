import type { BoolNode } from "./ast";
import { collectVariables } from "./ast";
import { evaluateAtIndex } from "./evaluator";
import { parseExpression } from "./parser";
import { toExpressionString } from "./printer";
import type { TruthTable, TruthTableRow } from "./truthTable";

/**
 * BooleanFunction —— 全项目唯一的函数模型
 *
 * 一切表示（表达式 / 真值表 / 卡诺图 / 电路 / 概率）都归结为：
 *   variables: 有序变量列表（A 为最高位）
 *   values:    长度 2^n 的输出向量，下标即最小项编号
 * 这两项是「事实」，其余字段只是便于展示的缓存。
 */

export type CellValue = 0 | 1 | "X";

export type FunctionSource = "expression" | "minterms" | "table";

export interface BooleanFunction {
  variables: string[];
  values: CellValue[];
  /** 展示用表达式（pretty 风格） */
  expression: string;
  /** 解析得到的 AST；由真值表直接构造时为 null */
  ast: BoolNode | null;
  source: FunctionSource;
  updatedAt: number;
  /** 用户原始输入（用于回填编辑器） */
  rawInput?: string;
}

export const ALL_VARIABLES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export const MAX_TABLE_VARIABLES = 6;
export const MAX_KARNAUGH_VARIABLES = 6;
export const MIN_KARNAUGH_VARIABLES = 2;

/** 变量按字母表排序，保证「固定顺序」这一约定 */
export function normalizeVariables(variables: string[]): string[] {
  const unique = Array.from(new Set(variables.map((v) => v.toUpperCase())));
  return unique.sort();
}

export function variableCount(fn: BooleanFunction): number {
  return fn.variables.length;
}

export function functionSize(fn: BooleanFunction): number {
  return 1 << fn.variables.length;
}

export function valueAt(fn: BooleanFunction, index: number): CellValue {
  return fn.values[index] ?? "X";
}

export function evaluateFunctionAt(fn: BooleanFunction, index: number): CellValue {
  return valueAt(fn, index);
}

export function mintermList(fn: BooleanFunction): number[] {
  const out: number[] = [];
  fn.values.forEach((v, i) => {
    if (v === 1) out.push(i);
  });
  return out;
}

export function maxtermList(fn: BooleanFunction): number[] {
  const out: number[] = [];
  fn.values.forEach((v, i) => {
    if (v === 0) out.push(i);
  });
  return out;
}

export function dontCareList(fn: BooleanFunction): number[] {
  const out: number[] = [];
  fn.values.forEach((v, i) => {
    if (v === "X") out.push(i);
  });
  return out;
}

export function onesCount(fn: BooleanFunction): number {
  return fn.values.reduce<number>((acc, v) => acc + (v === 1 ? 1 : 0), 0);
}

export function hasDontCares(fn: BooleanFunction): boolean {
  return fn.values.some((v) => v === "X");
}

export function isConstant(fn: BooleanFunction): boolean {
  const first = fn.values[0];
  if (first === "X") return false;
  return fn.values.every((v) => v === first);
}

/** Σm(1, 3, 5) 形式 */
export function mintermNotation(fn: BooleanFunction): string {
  const ms = mintermList(fn);
  const ds = dontCareList(fn);
  const parts: string[] = [];
  if (ms.length > 0 || ds.length === 0) parts.push(`Σm(${ms.join(", ")})`);
  if (ds.length > 0) parts.push(`+ Σd(${ds.join(", ")})`);
  return parts.join(" ");
}

/** ΠM(0, 2, 4) 形式 */
export function maxtermNotation(fn: BooleanFunction): string {
  return `ΠM(${maxtermList(fn).join(", ")})`;
}

export function truthTableOf(fn: BooleanFunction): TruthTable {
  const n = fn.variables.length;
  const rows: TruthTableRow[] = fn.values.map((v, index) => {
    const bits: boolean[] = [];
    for (let i = 0; i < n; i += 1) bits.push(((index >> (n - 1 - i)) & 1) === 1);
    return { index, bits, value: v === 1 };
  });
  return { variables: fn.variables, rows };
}

export interface BuildFunctionOptions {
  now?: number;
  rawInput?: string;
}

/** 从表达式构造函数：这是最主要的入口 */
export function functionFromExpression(
  input: string,
  options: BuildFunctionOptions = {}
): BooleanFunction {
  const { ast, body } = parseExpression(input);
  const variables = normalizeVariables(collectVariables(ast));
  if (variables.length === 0) {
    // 常量函数：F = 0 / F = 1，变量集为空
    const value = evaluateAtIndex(ast, [], 0) ? 1 : 0;
    return {
      variables: [],
      values: [value],
      expression: String(value),
      ast,
      source: "expression",
      updatedAt: options.now ?? Date.now(),
      rawInput: options.rawInput ?? body,
    };
  }
  if (variables.length > MAX_TABLE_VARIABLES) {
    throw new Error(
      `表达式包含 ${variables.length} 个变量，超过真值表上限 ${MAX_TABLE_VARIABLES} 个`
    );
  }
  const total = 1 << variables.length;
  const values: CellValue[] = new Array(total);
  for (let i = 0; i < total; i += 1) values[i] = evaluateAtIndex(ast, variables, i) ? 1 : 0;
  return {
    variables,
    values,
    expression: toExpressionString(ast),
    ast,
    source: "expression",
    updatedAt: options.now ?? Date.now(),
    rawInput: options.rawInput ?? body,
  };
}

/** 从最小项 / 无关项构造函数 */
export function functionFromMinterms(
  variables: string[],
  minterms: number[],
  dontCares: number[] = [],
  options: BuildFunctionOptions = {}
): BooleanFunction {
  const vars = normalizeVariables(variables);
  const total = 1 << vars.length;
  const values: CellValue[] = new Array(total).fill(0);
  for (const m of minterms) {
    if (!Number.isInteger(m) || m < 0 || m >= total) {
      throw new Error(`最小项 ${m} 超出 ${vars.length} 变量的范围 0–${total - 1}`);
    }
    values[m] = 1;
  }
  for (const d of dontCares) {
    if (!Number.isInteger(d) || d < 0 || d >= total) {
      throw new Error(`无关项 ${d} 超出 ${vars.length} 变量的范围 0–${total - 1}`);
    }
    if (values[d] === 1) {
      throw new Error(`最小项 ${d} 同时被标记为 1 与 X，请先移除其中一个`);
    }
    values[d] = "X";
  }
  const fn: BooleanFunction = {
    variables: vars,
    values,
    expression: "",
    ast: null,
    source: "minterms",
    updatedAt: options.now ?? Date.now(),
    rawInput: options.rawInput,
  };
  fn.expression = mintermNotation(fn);
  return fn;
}

/** 从完整输出向量构造函数（真值表编辑模式） */
export function functionFromValues(
  variables: string[],
  values: CellValue[],
  options: BuildFunctionOptions = {}
): BooleanFunction {
  const vars = normalizeVariables(variables);
  const total = 1 << vars.length;
  if (values.length !== total) {
    throw new Error(`输出向量长度应为 ${total}，实际为 ${values.length}`);
  }
  const fn: BooleanFunction = {
    variables: vars,
    values: [...values],
    expression: "",
    ast: null,
    source: "table",
    updatedAt: options.now ?? Date.now(),
    rawInput: options.rawInput,
  };
  fn.expression = mintermNotation(fn);
  return fn;
}

/**
 * 修改单个格子的值，返回新函数（不可变更新，便于撤销/重做与持久化）。
 */
export function withCellValue(
  fn: BooleanFunction,
  index: number,
  value: CellValue
): BooleanFunction {
  if (index < 0 || index >= fn.values.length) return fn;
  const values = [...fn.values];
  values[index] = value;
  const next: BooleanFunction = {
    ...fn,
    values,
    ast: null,
    source: "table",
    updatedAt: Date.now(),
  };
  next.expression = mintermNotation(next);
  return next;
}

/** 变量数为 count 的空函数（全部输出 0） */
export function emptyFunction(count: number): BooleanFunction {
  const vars = ALL_VARIABLES.slice(0, count);
  return functionFromValues(vars, new Array(1 << count).fill(0) as CellValue[]);
}

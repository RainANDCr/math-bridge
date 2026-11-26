import type { BoolNode } from "./ast";
import { evaluateAtIndex } from "./evaluator";

export interface TruthTableRow {
  /** 最小项编号（行号），A 为最高位 */
  index: number;
  /** 各变量取值，顺序与 variables 一致 */
  bits: boolean[];
  value: boolean;
}

export interface TruthTable {
  variables: string[];
  rows: TruthTableRow[];
}

/** 生成 2^n 行的真值表（纯函数输入） */
export function buildTruthTable(node: BoolNode, variables: string[]): TruthTable {
  const total = 1 << variables.length;
  const rows: TruthTableRow[] = new Array(total);
  for (let index = 0; index < total; index += 1) {
    const bits: boolean[] = new Array(variables.length);
    for (let i = 0; i < variables.length; i += 1) {
      bits[i] = ((index >> (variables.length - 1 - i)) & 1) === 1;
    }
    rows[index] = { index, bits, value: evaluateAtIndex(node, variables, index) };
  }
  return { variables, rows };
}

/** 把布尔向量转成 0/1 字符串，便于展示与复制 */
export function truthVectorString(values: Array<0 | 1 | "X">): string {
  return values.map((v) => (v === "X" ? "X" : String(v))).join("");
}

/** 把行号转成变量取值显示，如 5 → "101" */
export function bitsString(index: number, width: number): string {
  return index.toString(2).padStart(width, "0");
}

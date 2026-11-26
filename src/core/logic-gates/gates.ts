import type { BoolNode } from "../boolean/ast";
import { evaluate } from "../boolean/evaluator";
import { buildTruthTable } from "../boolean/truthTable";

/**
 * 逻辑门语义层
 *
 * 每个门只有一份真值来源：把它表示成 AST，再交给统一的求值内核。
 * UI 不允许自己写 "if (kind === 'NAND') ..." 之类的分支来算输出，
 * 否则一旦求值规则改动，界面上的灯和真值表就会各说各话。
 */

export type GateKind = "AND" | "OR" | "NOT" | "XOR" | "NAND" | "NOR" | "XNOR" | "BUFFER";

export const GATE_KINDS: GateKind[] = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR", "BUFFER"];

export interface GateMeta {
  kind: GateKind;
  zh: string;
  en: string;
  arity: 1 | 2;
  /** 该门的布尔表达式（AST），唯一事实来源 */
  ast: BoolNode;
  summary: string;
  /** 工作原理：为什么是这个真值表 */
  principle: string;
  /** 常见混淆点 */
  confusions: string[];
}

const A: BoolNode = { kind: "var", name: "A" };
const B: BoolNode = { kind: "var", name: "B" };
const and = (left: BoolNode, right: BoolNode): BoolNode => ({ kind: "and", left, right });
const or = (left: BoolNode, right: BoolNode): BoolNode => ({ kind: "or", left, right });
const xor = (left: BoolNode, right: BoolNode): BoolNode => ({ kind: "xor", left, right });
const not = (operand: BoolNode): BoolNode => ({ kind: "not", operand });

export const GATES: Record<GateKind, GateMeta> = {
  AND: {
    kind: "AND",
    zh: "与门",
    en: "AND",
    arity: 2,
    ast: and(A, B),
    summary: "所有输入为 1 时输出才为 1",
    principle: "与门相当于两个串联的开关：只有 A 和 B 都闭合，电流才能到达输出。",
    confusions: ["与门是 D 形（左侧平直、右侧半圆），或门是盾形；两者输出端都不带反相圈。"],
  },
  OR: {
    kind: "OR",
    zh: "或门",
    en: "OR",
    arity: 2,
    ast: or(A, B),
    summary: "任一输入为 1 时输出即为 1",
    principle: "或门相当于两个并联的开关：任意一个闭合，输出就为 1。",
    confusions: ["这是「可兼或」：A、B 同时为 1 时输出仍为 1，与异或不同。"],
  },
  NOT: {
    kind: "NOT",
    zh: "非门",
    en: "NOT / Inverter",
    arity: 1,
    ast: not(A),
    summary: "输出与输入反相",
    principle: "非门在三角形输出端带一个小圆圈（反相圈），圆圈表示取反，而不是门的种类。",
    confusions: ["反相圈画在输出端表示取反；画在输入端表示输入低电平有效，含义不同。"],
  },
  XOR: {
    kind: "XOR",
    zh: "异或门",
    en: "XOR",
    arity: 2,
    ast: xor(A, B),
    summary: "两个输入不同时输出为 1",
    principle: "异或门 = 或门再加一条弧线，表示「只允许一个为 1」。可用 (A·B̄)+(Ā·B) 搭出来。",
    confusions: ["异或不是「或」；1⊕1 = 0，而 1+1 = 1。"],
  },
  NAND: {
    kind: "NAND",
    zh: "与非门",
    en: "NAND",
    arity: 2,
    ast: not(and(A, B)),
    summary: "与门输出再取反，是通用门",
    principle: "与非门 = 与门 + 反相圈。任意布尔函数都能只用与非门搭出来，所以叫通用门。",
    confusions: ["¬(A·B) 不等于 ¬A·¬B；后者是或非。这是德摩根律最常被记错的地方。"],
  },
  NOR: {
    kind: "NOR",
    zh: "或非门",
    en: "NOR",
    arity: 2,
    ast: not(or(A, B)),
    summary: "或门输出再取反，也是通用门",
    principle: "或非门 = 或门 + 反相圈，同样可以单独构成任意布尔函数。",
    confusions: ["¬(A+B) = ¬A·¬B（德摩根），而 ¬A+¬B 等于 ¬(A·B)，那是否非门。"],
  },
  XNOR: {
    kind: "XNOR",
    zh: "同或门",
    en: "XNOR / Equivalence",
    arity: 2,
    ast: not(xor(A, B)),
    summary: "两个输入相同时输出为 1",
    principle: "同或门 = 异或门 + 反相圈；它也等价于双条件 A ↔ B。",
    confusions: ["同或的反相圈容易漏画，画成异或就完全相反了。"],
  },
  BUFFER: {
    kind: "BUFFER",
    zh: "缓冲器",
    en: "Buffer",
    arity: 1,
    ast: A,
    summary: "输出等于输入，用于驱动与整形",
    principle: "缓冲器不改变逻辑值，只增强驱动能力、隔离前后级或对齐时序。它没有反相圈。",
    confusions: ["缓冲器不是「导线」：逻辑上等价，电气上多了驱动与延迟。"],
  },
};

export function gateInputs(kind: GateKind): string[] {
  return GATES[kind].arity === 1 ? ["A"] : ["A", "B"];
}

export interface GateRow {
  a: 0 | 1;
  b?: 0 | 1;
  f: 0 | 1;
}

/** 真值表由 AST + 统一求值器生成，不在界面里手写 */
export function gateTruth(kind: GateKind): GateRow[] {
  const meta = GATES[kind];
  const variables = gateInputs(kind);
  const table = buildTruthTable(meta.ast, variables);
  return table.rows.map((row) => ({
    a: row.bits[0] ? 1 : 0,
    b: row.bits[1] === undefined ? undefined : row.bits[1] ? 1 : 0,
    f: row.value ? 1 : 0,
  }));
}

/** 给定输入求输出，同样走统一内核 */
export function gateOutput(kind: GateKind, a: 0 | 1, b: 0 | 1 = 0): 0 | 1 {
  const assignment: Record<string, boolean> = { A: a === 1 };
  if (GATES[kind].arity === 2) assignment.B = b === 1;
  return evaluate(GATES[kind].ast, assignment) ? 1 : 0;
}

/** 该门是否能由某个输入组合激活（用于真值表高亮当前行） */
export function rowMatches(kind: GateKind, row: GateRow, a: 0 | 1, b: 0 | 1): boolean {
  return row.a === a && (GATES[kind].arity === 1 || row.b === b);
}

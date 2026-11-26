import type { BoolNode } from "../boolean/ast";
import type { BooleanFunction } from "../boolean/model";
import type { Literal } from "../karnaugh/implicants";
import { minimizeValues } from "../karnaugh/minimizer";
import { sopToAst } from "../karnaugh/sopAst";
import { renderBooleanAlgebra } from "./renderers/booleanAlgebra";
import { renderDigitalElectronics } from "./renderers/digitalElectronics";
import { renderDiscreteMath } from "./renderers/discreteMath";
import { renderProbability } from "./renderers/probability";
import { renderSetTheory } from "./renderers/setTheory";
import {
  DISCIPLINES,
  type Discipline,
  type NotationMode,
  type NotationStyle,
  type RenderedNotation,
} from "./notationTypes";

/**
 * 符号映射与转换入口
 *
 * 唯一的输入是 AST；唯一的输出是「记号树 + 文本」。
 * 没有任何一步是字符串替换，因此不会出现
 * 「把 A+B 里的 + 换成 ∪，却忘了 A(B+C) 里的隐式乘号」这种漏改。
 */

const RENDERERS: Record<
  Discipline,
  (node: BoolNode, style: NotationStyle) => RenderedNotation
> = {
  discrete: renderDiscreteMath,
  digital: renderDigitalElectronics,
  boolean: renderBooleanAlgebra,
  set: renderSetTheory,
  probability: renderProbability,
};

export function renderNotation(
  node: BoolNode,
  mode: Discipline,
  style: NotationStyle = "textbook"
): RenderedNotation {
  return RENDERERS[mode](node, style);
}

export function renderAllDisciplines(
  node: BoolNode,
  style: NotationStyle = "textbook"
): RenderedNotation[] {
  return DISCIPLINES.map((d) => RENDERERS[d.id](node, style));
}

export function renderMode(
  node: BoolNode,
  mode: NotationMode,
  style: NotationStyle = "textbook"
): RenderedNotation[] {
  return mode === "all" ? renderAllDisciplines(node, style) : [renderNotation(node, mode, style)];
}

/**
 * 当前函数对应的 AST。
 *
 * 由真值表直接定义的函数没有 AST，此时用最简与或式作为「可读代表」——
 * 它与函数等价，但不等同于用户的原始输入，界面必须注明这一点。
 */
export function displayAst(fn: BooleanFunction): BoolNode {
  if (fn.ast) return fn.ast;
  if (fn.variables.length === 0) {
    return { kind: "const", value: fn.values[0] === 1 ? 1 : 0 };
  }
  const sop = minimizeValues(fn.variables, fn.values);
  return sopToAst(sop.terms, fn.variables);
}

/**
 * 规范与或式对应的 AST（每个最小项一项）。
 * 项数超过 limit 时返回 null —— 界面不该被 64 项的超长公式撑破。
 */
export function canonicalSopAst(fn: BooleanFunction, limit = 16): BoolNode | null {
  const n = fn.variables.length;
  if (n === 0) return { kind: "const", value: fn.values[0] === 1 ? 1 : 0 };
  const terms: BoolNode[] = [];
  for (let index = 0; index < fn.values.length; index += 1) {
    if (fn.values[index] !== 1) continue;
    if (terms.length >= limit) return null;
    let node: BoolNode | null = null;
    for (let j = 0; j < n; j += 1) {
      const bit = (index >> (n - 1 - j)) & 1;
      const variable: BoolNode = { kind: "var", name: fn.variables[j] };
      const literal: BoolNode = bit === 1 ? variable : { kind: "not", operand: variable };
      node = node ? { kind: "and", left: node, right: literal } : literal;
    }
    terms.push(node ?? { kind: "const", value: 1 });
  }
  if (terms.length === 0) return { kind: "const", value: 0 };
  return terms
    .slice(1)
    .reduce<BoolNode>((acc, term) => ({ kind: "or", left: acc, right: term }), terms[0]);
}

/** 一个乘积项（K 图分组）在指定记法下的文本，用于图内标签 */
export function termToNotation(
  literals: Literal[],
  mode: Discipline,
  style: NotationStyle = "textbook"
): string {
  if (literals.length === 0) return "1";
  let node: BoolNode | null = null;
  for (const literal of literals) {
    const base: BoolNode = { kind: "var", name: literal.variable };
    const literalNode: BoolNode = literal.negated ? { kind: "not", operand: base } : base;
    node = node ? { kind: "and", left: node, right: literalNode } : literalNode;
  }
  return renderNotation(node ?? { kind: "const", value: 1 }, mode, style).text;
}

/** 一个和项（POS 分组）在指定记法下的文本 */
export function clauseToNotation(
  literals: Literal[],
  mode: Discipline,
  style: NotationStyle = "textbook"
): string {
  if (literals.length === 0) return "0";
  let node: BoolNode | null = null;
  for (const literal of literals) {
    const base: BoolNode = { kind: "var", name: literal.variable };
    const literalNode: BoolNode = literal.negated ? base : { kind: "not", operand: base };
    node = node ? { kind: "or", left: node, right: literalNode } : literalNode;
  }
  return renderNotation(node ?? { kind: "const", value: 0 }, mode, style).text;
}

/** 记法体系的名字，用于在公式旁注明「当前采用哪种写法」 */
export function notationTitle(mode: NotationMode, style: NotationStyle): string {
  if (mode === "all") return `全学科对照 · ${style === "textbook" ? "教材记法" : "简写记法"}`;
  const info = DISCIPLINES.find((d) => d.id === mode);
  return `${info?.zh ?? mode} · ${style === "textbook" ? "教材记法" : "简写记法"}`;
}

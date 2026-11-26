import type { BoolNode } from "../boolean/ast";
import type { Cube } from "./implicants";

/**
 * 把最小化后的乘积项还原成 AST。
 *
 * 用途：当真值表是「唯一事实来源」（例如用户直接编辑卡诺图格子）时，
 * 表达式栏没有内容，但电路图仍然需要一棵语法树。此时用最简与或式生成电路，
 * 相当于展示「这个函数最终会被实现成什么电路」。
 */
export function sopToAst(terms: Cube[], _variables: string[]): BoolNode {
  if (terms.length === 0) return { kind: "const", value: 0 };

  const termNodes: BoolNode[] = terms.map((term) => {
    if (term.literals.length === 0) return { kind: "const", value: 1 };
    let node: BoolNode | null = null;
    for (const literal of term.literals) {
      const base: BoolNode = { kind: "var", name: literal.variable };
      const literalNode: BoolNode = literal.negated ? { kind: "not", operand: base } : base;
      node = node ? { kind: "and", left: node, right: literalNode } : literalNode;
    }
    return node ?? { kind: "const", value: 1 };
  });

  if (termNodes.length === 1 && termNodes[0].kind === "const" && termNodes[0].value === 1) {
    return { kind: "const", value: 1 };
  }

  return termNodes.reduce((acc, node) => ({ kind: "or", left: acc, right: node }));
}

/** 变量列表 → 空函数的 AST（用于「没有表达式」时的占位） */
export function constantAst(value: 0 | 1): BoolNode {
  return { kind: "const", value };
}

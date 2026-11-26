import type { BoolNode } from "../../boolean/ast";
import { NOTA_PREC, bar, seq, t, wrap, type NotaNode } from "../notationTypes";

/**
 * 渲染引擎
 *
 * 五个学科共用同一套「括号放在哪里」的算法，只有字形不同。
 * 这是刻意的：如果把括号规则也按学科各写一份，很容易出现
 * 离散数学模式少一层括号、数字电路模式多一层括号这种漂移，
 * 而两种写法在真值表上仍然等价 —— 错误不会自己暴露。
 */

export type NotForm =
  | { form: "prefix"; glyph: string }
  | { form: "postfix"; glyph: string }
  | { form: "bar" }
  | { form: "sup"; glyph: string };

export interface RenderGlyphs {
  /** 与运算的中缀符号，含两侧空格；空串表示省略乘号（相邻书写） */
  and: string;
  or: string;
  xor: string;
  /** 同或的中缀符号；未提供时按 ¬(A ⊕ B) 展开 */
  xnor?: string;
  not: NotForm;
}

/** 取出 not(xor(a,b)) 的两个操作数，用于把同或写成 A ⊙ B / A ↔ B */
function xnorOf(node: BoolNode): { left: BoolNode; right: BoolNode } | null {
  if (node.kind === "not" && node.operand.kind === "xor") {
    return { left: node.operand.left, right: node.operand.right };
  }
  return null;
}

/** 后缀取反必须给复合操作数加括号：(A+B)′，而 A′ 不用 */
function needsParensForPostfix(node: BoolNode): boolean {
  return node.kind !== "var" && node.kind !== "const";
}

function emitNot(operand: BoolNode, minPrec: number, g: RenderGlyphs): NotaNode {
  switch (g.not.form) {
    case "prefix": {
      const inner = emit(operand, NOTA_PREC.not, g);
      return wrap(seq([t(g.not.glyph), inner]), NOTA_PREC.not < minPrec);
    }
    case "postfix": {
      // 先用 0 优先级渲染，再由括号规则统一加一层，避免出现 ((A+B))′
      const inner = emit(operand, 0, g);
      const body = wrap(inner, needsParensForPostfix(operand));
      return wrap(seq([body, t(g.not.glyph)]), NOTA_PREC.not < minPrec);
    }
    case "bar":
      // 上划线本身就界定了取反范围，因此不需要括号
      return bar(emit(operand, 0, g));
    case "sup": {
      const inner = emit(operand, 0, g);
      const body = wrap(inner, needsParensForPostfix(operand));
      return seq([body, { kind: "sup", text: g.not.glyph }]);
    }
  }
}

function emitBinary(
  node: Extract<BoolNode, { kind: "and" | "or" | "xor" }>,
  symbol: string,
  own: number,
  minPrec: number,
  g: RenderGlyphs,
  forceExplicit = false
): NotaNode {
  // 省略乘号时遇到常量必须补一个显式 ·，否则 A·1 会写成 "A1"
  const effective = forceExplicit && symbol === "" ? "·" : symbol;
  const left = emit(node.left, own, g);
  const right = emit(node.right, own, g);
  const children: NotaNode[] = effective === "" ? [left, right] : [left, t(effective), right];
  return wrap(seq(children), own < minPrec);
}

export function emit(node: BoolNode, minPrec: number, g: RenderGlyphs): NotaNode {
  switch (node.kind) {
    case "var":
      return t(node.name, "var");
    case "const":
      return t(String(node.value), "const");
    case "not": {
      if (g.xnor) {
        const pair = xnorOf(node);
        if (pair) {
          const synthetic = { kind: "xor" as const, left: pair.left, right: pair.right };
          return emitBinary(synthetic, g.xnor, NOTA_PREC.xor, minPrec, g);
        }
      }
      return emitNot(node.operand, minPrec, g);
    }
    case "and":
      return emitBinary(
        node,
        g.and,
        NOTA_PREC.and,
        minPrec,
        g,
        // 省略乘号时，A 与常量 1 相邻会写成 "A1"，必须补一个显式乘号
        node.left.kind === "const" || node.right.kind === "const"
      );
    case "or":
      return emitBinary(node, g.or, NOTA_PREC.or, minPrec, g);
    case "xor":
      return emitBinary(node, g.xor, NOTA_PREC.xor, minPrec, g);
  }
}

/** 按字形表渲染整棵树；minPrec 为 0 表示顶层 */
export function renderTree(node: BoolNode, g: RenderGlyphs): NotaNode {
  return emit(node, 0, g);
}

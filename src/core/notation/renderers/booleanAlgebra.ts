import type { BoolNode } from "../../boolean/ast";
import {
  DISCIPLINE_MAP,
  notaText,
  type NotationStyle,
  type RenderedNotation,
} from "../notationTypes";
import { renderTree, type RenderGlyphs } from "./shared";

/**
 * 布尔代数
 *
 * 代数写法：相邻文字即相乘（与），+ 即相加（或），撇号表示补元。
 * 这里的「乘」「加」是格（lattice）上的运算，不满足普通算术的直觉：
 * 1 + 1 = 1，A + A = A。
 */

const TEXTBOOK: RenderGlyphs = {
  not: { form: "postfix", glyph: "′" },
  and: "",
  or: " + ",
  xor: " ⊕ ",
  xnor: " ⊙ ",
};

const COMPACT: RenderGlyphs = {
  not: { form: "postfix", glyph: "′" },
  and: "",
  or: "+",
  xor: "⊕",
  xnor: "⊙",
};

export function renderBooleanAlgebra(node: BoolNode, style: NotationStyle): RenderedNotation {
  const nodes = renderTree(node, style === "compact" ? COMPACT : TEXTBOOK);
  return {
    mode: "boolean",
    nodes,
    text: notaText(nodes),
    ascii: notaText(nodes),
    caveat: DISCIPLINE_MAP.boolean.caveat,
  };
}

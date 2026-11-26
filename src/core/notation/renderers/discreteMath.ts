import type { BoolNode } from "../../boolean/ast";
import {
  DISCIPLINE_MAP,
  notaText,
  type NotationStyle,
  type RenderedNotation,
} from "../notationTypes";
import { renderTree, type RenderGlyphs } from "./shared";

/**
 * 离散数学（命题逻辑）
 *
 * 教材记法 ¬ ∧ ∨ ⊕ ↔；简写记法是键盘上能直接敲出的 ~ & | ^。
 * 两者都基于同一棵 AST，只有字形不同。
 */

const TEXTBOOK: RenderGlyphs = {
  not: { form: "prefix", glyph: "¬" },
  and: " ∧ ",
  or: " ∨ ",
  xor: " ⊕ ",
  xnor: " ↔ ",
};

const COMPACT: RenderGlyphs = {
  not: { form: "prefix", glyph: "~" },
  and: "&",
  or: "|",
  xor: "^",
  xnor: "↔",
};

export function renderDiscreteMath(node: BoolNode, style: NotationStyle): RenderedNotation {
  const nodes = renderTree(node, style === "compact" ? COMPACT : TEXTBOOK);
  return {
    mode: "discrete",
    nodes,
    text: notaText(nodes),
    ascii: notaText(nodes),
    caveat: DISCIPLINE_MAP.discrete.caveat,
  };
}

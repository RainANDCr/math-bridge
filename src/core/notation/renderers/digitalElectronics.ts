import type { BoolNode } from "../../boolean/ast";
import {
  DISCIPLINE_MAP,
  notaText,
  type NotationStyle,
  type RenderedNotation,
} from "../notationTypes";
import { renderTree, type RenderGlyphs } from "./shared";

/**
 * 数字电路
 *
 * 教材记法：与写 ·、或写 +、取反写上划线（bar），同或写 ⊙。
 * 上划线不带括号 —— 横线覆盖到哪里，取反就作用到哪里，这是工程图的核心约定。
 *
 * 简写记法：省略乘号、撇号代替上划线，便于在只有键盘时记录。
 */

const TEXTBOOK: RenderGlyphs = {
  not: { form: "bar" },
  and: "·",
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

export function renderDigitalElectronics(node: BoolNode, style: NotationStyle): RenderedNotation {
  const nodes = renderTree(node, style === "compact" ? COMPACT : TEXTBOOK);
  return {
    mode: "digital",
    nodes,
    text: notaText(nodes),
    ascii: notaText(nodes),
    caveat: DISCIPLINE_MAP.digital.caveat,
  };
}

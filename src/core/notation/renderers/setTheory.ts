import type { BoolNode } from "../../boolean/ast";
import {
  DISCIPLINE_MAP,
  notaText,
  type NotationStyle,
  type RenderedNotation,
} from "../notationTypes";
import { renderTree, type RenderGlyphs } from "./shared";

/**
 * 集合论
 *
 * ∩ 交集、∪ 并集、ᶜ 补集、△ 对称差。
 *
 * 注意立场：这是「把变量解释为全集 U 的子集」之后的结构对应，
 * 不是说逻辑与和集合交集是同一个对象。命题的真假对应元素是否属于集合。
 *
 * 同或不设专门符号：写 (A △ B)ᶜ，恰好也说明了它的含义。
 */

const TEXTBOOK: RenderGlyphs = {
  not: { form: "sup", glyph: "c" },
  and: " ∩ ",
  or: " ∪ ",
  xor: " △ ",
};

const COMPACT: RenderGlyphs = {
  not: { form: "sup", glyph: "c" },
  and: "∩",
  or: "∪",
  xor: "△",
};

export function renderSetTheory(node: BoolNode, style: NotationStyle): RenderedNotation {
  const nodes = renderTree(node, style === "compact" ? COMPACT : TEXTBOOK);
  return {
    mode: "set",
    nodes,
    text: notaText(nodes),
    ascii: notaText(nodes),
    caveat: DISCIPLINE_MAP.set.caveat,
    conditions: ["需要先指定全集 U：补集 Aᶜ 是相对于 U 而言的。"],
  };
}

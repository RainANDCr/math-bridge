import type { BoolNode } from "../../boolean/ast";
import {
  DISCIPLINE_MAP,
  notaText,
  seq,
  t,
  type NotationStyle,
  type RenderedNotation,
} from "../notationTypes";
import { renderSetTheory } from "./setTheory";

/**
 * 概率论
 *
 * 事件层面沿用集合运算（∩ ∪ △ ᶜ），外面套 P(·) 表示取概率。
 *
 * 这里有一条硬规矩：**绝不**把逻辑表达式直接翻译成概率乘法。
 * P(A ∩ B) 与 P(A)·P(B) 只有在 A、B 独立时才相等，
 * 而独立性是额外条件，不能从布尔结构推出来。
 */

export function renderProbability(node: BoolNode, style: NotationStyle): RenderedNotation {
  const inner = renderSetTheory(node, style);
  const nodes = seq([t("P", "call"), t("(", "paren"), inner.nodes, t(")", "paren")]);
  return {
    mode: "probability",
    nodes,
    text: notaText(nodes),
    // 概率表达式里的 P（·）不是布尔运算符，回填解析时只取事件部分
    ascii: inner.ascii,
    caveat: DISCIPLINE_MAP.probability.caveat,
    conditions: [
      "要算出数值，必须知道每个事件的概率 P(A)、P(B)、P(C)…",
      "还必须知道它们的联合关系，或明确假设相互独立；仅凭布尔结构推不出数值。",
      "P(A ∩ B) = P(A)·P(B) 只在独立时成立；一般情况用 P(A∪B) = P(A)+P(B)−P(A∩B)。",
    ],
  };
}

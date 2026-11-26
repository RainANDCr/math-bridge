import { describe, expect, it } from "vitest";
import { CONCEPTS } from "../core/knowledge/concepts";
import { EXAMPLES } from "../features/overview/examples";
import { parseExpression } from "../core/boolean/parser";
import type { BoolNode } from "../core/boolean/ast";

/**
 * 界面文案里的示例表达式
 *
 * 这里守的是一类反复犯的错：把符号按钮改成数电记法 `· + ′ ⊕` 之后，
 * 散落在示例、概念卡、提示语里的 `F = A & B`、`F = A | B`、`F = !A` 没人管，
 * 于是应用一边按钮写着 `·`，一边在正文里教 `&`。
 *
 * 判据不依赖「我记得改过哪些文件」，只查文案本身：
 * 1. 不得出现 C 风格记号 `& | ! ^`（`P(B|A)` 这种条件概率竖线先剥掉再查）；
 * 2. 示例必须能解析；
 * 3. 有取反就必须写成后缀 `′` —— 数电记法里 `¬A` / `!A` 都不算这个写法。
 */

/** 条件概率 P(B|A) 的竖线是正当用法，不是布尔「或」；先整体剥掉再检查 */
function stripProbability(text: string): string {
  return text.replace(/P\([^()]*\)/g, "P");
}

const C_STYLE = /[&|!^]/;

function hasNot(node: BoolNode): boolean {
  switch (node.kind) {
    case "var":
    case "const":
      return false;
    case "not":
      return true;
    case "and":
    case "or":
    case "xor":
      return hasNot(node.left) || hasNot(node.right);
  }
}

describe("文案里的示例表达式", () => {
  it("首页示例用的是数电记法", () => {
    for (const example of EXAMPLES) {
      const body = example.expr.replace(/^F\s*=\s*/, "");
      expect(body, example.expr).not.toMatch(C_STYLE);
      expect(example.goal, example.expr).not.toMatch(C_STYLE);

      const { ast } = parseExpression(body);
      if (hasNot(ast)) expect(body, `${example.expr} 的取反要写成后缀 ′`).toContain("′");
    }
  });

  it("概念卡的正文与示例里没有 C 风格记号", () => {
    for (const concept of CONCEPTS) {
      const text = [
        concept.definition,
        concept.formula,
        concept.intuition,
        concept.experiment,
        ...(concept.misconceptions ?? []),
        ...concept.cross.map((item) => item.text),
      ].join(" ");
      expect(stripProbability(text), concept.id).not.toMatch(C_STYLE);
    }
  });

  it("概念卡里出现的 F = … 示例都能解析", () => {
    for (const concept of CONCEPTS) {
      // 只取「F = 」后面那一段**公式字符**（遇到中文就停），
      // 否则「F = A·B 在卡诺图上…」会把正文也算进表达式
      // P(F = 1) 里的 F = 1 不是示例表达式，先剥掉概率写法
      for (const match of stripProbability(concept.experiment).matchAll(/F\s*=\s*([A-Za-z01·+⊕¬()′' ]+)/g)) {
        const body = match[1].trim().replace(/\s+/g, " ");
        if (!body) continue;
        expect(() => parseExpression(body), `${concept.id}: ${body}`).not.toThrow();
      }
    }
  });
});

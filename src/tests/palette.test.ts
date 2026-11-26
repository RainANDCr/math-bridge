import { describe, expect, it } from "vitest";
import {
  applyPalette,
  hintFor,
  noteFor,
  noteText,
  paletteFor,
  placeholderFor,
} from "../core/notation/editorPalette";
import { renderNotation } from "../core/notation/notationConversion";
import { hasBar } from "../core/notation/notationTypes";
import { parseExpression } from "../core/boolean/parser";
import type { BoolNode } from "../core/boolean/ast";
import type { NotationMode } from "../core/notation/notationTypes";

/**
 * 输入框的符号按钮
 *
 * 这里守的是最容易犯、也最难自己发现的一类错：
 * 按钮上画的和词法分析器认的不是同一个字符 —— 用户点一下，式子就报语法错误。
 * 旧版的 `!` 按钮还会把字符插到光标处，把 `F = ...` 顶成 `!F = ...`，
 * 赋值前缀认不出来，整行作废。
 */

const MODES: NotationMode[] = ["digital", "boolean", "discrete", "set", "probability", "all"];

function op(mode: NotationMode, id: string) {
  const button = paletteFor(mode).find((item) => item.id === id);
  if (!button) throw new Error(`${mode} 缺少 ${id} 按钮`);
  return button;
}

/** 把按钮用在 "A" 与 "B" 之间，返回结果文本 */
function between(mode: NotationMode, id: string): string {
  const button = op(mode, id);
  const { text } = applyPalette(button, "AB", 1, 1);
  return text;
}

describe("输入框符号按钮", () => {
  it("每个学科都有与/或/非/异或四个按钮，外加括号与常量", () => {
    for (const mode of MODES) {
      const ids = paletteFor(mode).map((item) => item.id);
      expect(ids, mode).toEqual(["and", "or", "not", "xor", "lparen", "rparen", "zero", "one"]);
    }
  });

  it("按钮插入的字符真的能被解析 —— 点一下不会把式子变成语法错误", () => {
    for (const mode of MODES) {
      const and = between(mode, "and");
      expect(() => parseExpression(and), `${mode}: ${and}`).not.toThrow();

      const or = between(mode, "or");
      expect(() => parseExpression(or), `${mode}: ${or}`).not.toThrow();

      const xor = between(mode, "xor");
      expect(() => parseExpression(xor), `${mode}: ${xor}`).not.toThrow();

      // 取反作用在 B 上：A 紧跟一个后缀，或 A 后面接前缀
      const not = between(mode, "not");
      expect(() => parseExpression(not), `${mode}: ${not}`).not.toThrow();
    }
  });

  it("插入的三种二元运算真值不同 —— 按钮没有插错字符", () => {
    for (const mode of MODES) {
      const vectors = ["and", "or", "xor"].map((id) => {
        const { ast } = parseExpression(between(mode, id));
        return [0, 1, 2, 3]
          .map((row) => (evaluateAst(ast, { A: (row >> 1) & 1, B: row & 1 }) ? 1 : 0))
          .join("");
      });
      // 与=0001、或=0111、异或=0110：三个向量必须各不相同
      expect(new Set(vectors).size, `${mode} 的三种运算真值向量互不相同`).toBe(3);
      expect(vectors[0], mode).toBe("0001");
      expect(vectors[1], mode).toBe("0111");
      expect(vectors[2], mode).toBe("0110");
    }
  });

  it("选中一段再点取反，会整体加括号，而不是把撇号丢在末尾", () => {
    const button = op("digital", "not");
    // 选中 "A·B"（下标 0..3），点 ′
    const { text, caret } = applyPalette(button, "A·B+C", 0, 3);
    expect(text).toBe("(A·B)′+C");
    expect(caret).toBe(6);
    // 括号是必须的：A·B′ 与 (A·B)′ 语义相反
    expect(text).not.toBe("A·B′+C");
  });

  it("前缀取反（离散记法）遇到选区也整体加括号", () => {
    const button = op("discrete", "not");
    const { text } = applyPalette(button, "A∧B", 0, 3);
    expect(text).toBe("¬(A∧B)");
  });

  it("没有选区时，后缀取反插在光标处 —— 先写操作数再取反", () => {
    const button = op("digital", "not");
    const { text, caret } = applyPalette(button, "F = C", 5, 5);
    expect(text).toBe("F = C′");
    expect(caret).toBe(6);
  });

  it("二元运算两侧带空格，紧挨变量的写法不会被粘连", () => {
    const button = op("digital", "and");
    const { text } = applyPalette(button, "AB", 1, 1);
    expect(text).toBe("A · B");
  });

  it("「′ 会画成上划线」只在数电下成立 —— 说明与渲染器必须一致", () => {
    const { ast } = parseExpression("A′");

    // 数电：渲染成结构化上划线节点，所以需要说明
    const digital = renderNotation(ast, "digital", "textbook");
    expect(hasBar(digital.nodes)).toBe(true);
    expect(noteText(noteFor("digital"))).toContain("上划线");
    // 说明里的示例本身必须是结构化 bar 节点 —— 走公式同一条渲染路径，
    // 而不是把组合上划线字符塞进字符串（那个字符在字体里会偏右偏高）
    expect(noteFor("digital")?.sample).toMatchObject({ kind: "bar" });
    expect(noteText(noteFor("digital"))).toContain("A\u0305");

    // 布尔代数的撇号渲染出来还是撇号，集合/概率是上标 —— 这些记法说「会变样」就是错的
    expect(renderNotation(ast, "boolean", "textbook").text).toBe("A′");
    expect(renderNotation(ast, "set", "textbook").text).toBe("Aᶜ");
    expect(noteFor("boolean")).toBeNull();
    expect(noteFor("set")).toBeNull();
    expect(noteFor("probability")).toBeNull();

    // 离散记法是前缀 ¬，撇号本就不是它的写法
    expect(noteFor("discrete")).toBeNull();
  });

  it("凡是有说明的记法，渲染结果就必须真的含上划线节点", () => {
    const { ast } = parseExpression("A′");
    for (const mode of MODES) {
      // 「全学科」不是一种记法，它并排显示五份；按钮退到数电
      if (mode === "all") continue;
      if (!noteFor(mode)) continue;
      expect(hasBar(renderNotation(ast, mode, "textbook").nodes), mode).toBe(true);
    }
    expect(noteFor("all")).toBe(noteFor("digital"));
  });

  it("占位符与提示都跟随记法，且给出的样例本身可解析", () => {
    for (const mode of MODES) {
      const placeholder = placeholderFor(mode);
      expect(placeholder.length, mode).toBeGreaterThan(0);
      // 占位符前半段是样例，必须真能解析 —— 否则又是一处「教你写错的语法」
      const sample = placeholder.split("　")[0].replace(/^F\s*=\s*/, "");
      expect(() => parseExpression(sample), `${mode}: ${sample}`).not.toThrow();
      expect(hintFor(mode).length, mode).toBeGreaterThan(0);
    }
  });
});

/** 只在测试里用：按变量取值求 AST */
function evaluateAst(node: BoolNode, env: Record<string, number>): boolean {
  switch (node.kind) {
    case "var":
      return env[node.name] === 1;
    case "const":
      return node.value === 1;
    case "not":
      return !evaluateAst(node.operand, env);
    case "and":
      return evaluateAst(node.left, env) && evaluateAst(node.right, env);
    case "or":
      return evaluateAst(node.left, env) || evaluateAst(node.right, env);
    case "xor":
      return evaluateAst(node.left, env) !== evaluateAst(node.right, env);
  }
}

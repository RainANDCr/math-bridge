import { describe, expect, it } from "vitest";
import { tokenize } from "../core/boolean/tokenizer";
import { parse } from "../core/boolean/parser";
import { ExpressionError } from "../core/boolean/errors";
import { evaluate } from "../core/boolean/evaluator";
import { toExpressionString } from "../core/boolean/printer";
import {
  functionFromExpression,
  mintermList,
  maxtermList,
  dontCareList,
  functionFromMinterms,
  withCellValue,
} from "../core/boolean/model";
import { canonicalSOP, areEquivalent } from "../core/boolean/booleanAlgebra";
import { tryParseMintermNotation } from "../core/boolean/mintermInput";

describe("tokenizer", () => {
  it("识别变量与三种运算符", () => {
    const tokens = tokenize("A & !B | C");
    expect(tokens.map((t) => t.type)).toEqual(["VAR", "AND", "NOT", "VAR", "OR", "VAR"]);
    expect(tokens.map((t) => t.value)).toEqual(["A", "&", "!", "B", "|", "C"]);
  });

  it("支持教材中的多种写法", () => {
    expect(tokenize("¬A ∧ B ∨ C").map((t) => t.type)).toEqual([
      "NOT",
      "VAR",
      "AND",
      "VAR",
      "OR",
      "VAR",
    ]);
    expect(tokenize("A·B + C").map((t) => t.type)).toEqual(["VAR", "AND", "VAR", "OR", "VAR"]);
    expect(tokenize("A ⊕ B").map((t) => t.type)).toEqual(["VAR", "XOR", "VAR"]);
  });

  it("小写变量自动转大写", () => {
    expect(tokenize("a & b")[0].value).toBe("A");
    expect(tokenize("a & b")[2].value).toBe("B");
  });

  it("支持 A' 后缀取反（后缀而非前缀，否则 A' & B 会被读成多余记号）", () => {
    const tokens = tokenize("A' & B");
    expect(tokens.map((t) => t.type)).toEqual(["VAR", "POSTFIX", "AND", "VAR"]);
    expect(toExpressionString(parse("A' & B"))).toBe("¬A·B");
  });

  it("非法字符报出准确位置", () => {
    try {
      tokenize("A & B # C");
      expect.unreachable("应当抛出错误");
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError);
      const e = error as ExpressionError;
      expect(e.position).toBe(6);
      expect(e.message).toContain("#");
    }
  });
});

describe("parser", () => {
  it("AND 优先于 OR", () => {
    expect(toExpressionString(parse("A | B & C"))).toBe("A + B·C");
    expect(toExpressionString(parse("A & B | C"))).toBe("A·B + C");
  });

  it("NOT 优先级最高", () => {
    expect(toExpressionString(parse("!A & B"))).toBe("¬A·B");
    expect(toExpressionString(parse("!(A & B)"))).toBe("¬(A·B)");
  });

  it("XOR 介于 AND 与 OR 之间", () => {
    expect(toExpressionString(parse("A | B ^ C"))).toBe("A + B⊕C");
    expect(toExpressionString(parse("A ^ B & C"))).toBe("A⊕B·C");
  });

  it("括号改变结合方式", () => {
    const a = functionFromExpression("(A | B) & C");
    const b = functionFromExpression("A | B & C");
    expect(mintermList(a)).toEqual([3, 5, 7]);
    expect(mintermList(b)).toEqual([3, 4, 5, 6, 7]);
  });

  it("支持 F = 前缀", () => {
    const fn = functionFromExpression("F = A & B");
    expect(fn.variables).toEqual(["A", "B"]);
    expect(mintermList(fn)).toEqual([3]);
  });

  it("缺少操作数时报错", () => {
    expect(() => parse("A &")).toThrow(ExpressionError);
    expect(() => parse("A &")).toThrow(/意外结束/);
  });

  it("括号未闭合时报错并指明位置", () => {
    try {
      parse("A & (B | C");
      expect.unreachable("应当抛出错误");
    } catch (error) {
      const e = error as ExpressionError;
      expect(e.message).toContain("括号没有闭合");
      expect(e.position).toBe(4);
    }
  });

  it("空表达式报错", () => {
    expect(() => parse("   ")).toThrow(/表达式为空/);
  });

  it("多余的右括号报错", () => {
    expect(() => parse("A & B)")).toThrow(/多余内容/);
  });
});

describe("evaluator", () => {
  it("按赋值求值", () => {
    const ast = parse("A & !B | C");
    expect(evaluate(ast, { A: true, B: false, C: false })).toBe(true);
    expect(evaluate(ast, { A: true, B: true, C: false })).toBe(false);
    expect(evaluate(ast, { A: false, B: true, C: true })).toBe(true);
  });

  it("XOR 语义是异或", () => {
    const ast = parse("A ^ B");
    expect(evaluate(ast, { A: true, B: true })).toBe(false);
    expect(evaluate(ast, { A: true, B: false })).toBe(true);
  });

  it("缺变量时报错", () => {
    expect(() => evaluate(parse("A & B"), { A: true })).toThrow(/没有赋值/);
  });
});

describe("真值表与最小项", () => {
  it("(A&B)|C 的最小项集合", () => {
    const fn = functionFromExpression("F = (A & B) | C");
    expect(fn.variables).toEqual(["A", "B", "C"]);
    expect(fn.values).toHaveLength(8);
    expect(mintermList(fn)).toEqual([1, 3, 5, 6, 7]);
    expect(maxtermList(fn)).toEqual([0, 2, 4]);
  });

  it("最小项编号以 A 为最高位", () => {
    // A=1,B=0,C=1 → 101 → m5
    const fn = functionFromExpression("A & !B & C");
    expect(mintermList(fn)).toEqual([5]);
  });

  it("变量顺序固定为字母序", () => {
    const fn = functionFromExpression("C & A");
    expect(fn.variables).toEqual(["A", "C"]);
  });

  it("常量函数", () => {
    const one = functionFromExpression("1");
    expect(one.variables).toEqual([]);
    expect(one.values).toEqual([1]);
    const zero = functionFromExpression("0");
    expect(zero.values).toEqual([0]);
  });

  it("无关项可从真值表构造", () => {
    const fn = functionFromMinterms(["A", "B"], [0, 1], [3]);
    expect(fn.values).toEqual([1, 1, 0, "X"]);
    expect(dontCareList(fn)).toEqual([3]);
  });

  it("最小项越界报错", () => {
    expect(() => functionFromMinterms(["A", "B"], [5])).toThrow(/超出/);
  });

  it("同时标记为 1 与 X 报错", () => {
    expect(() => functionFromMinterms(["A", "B"], [2], [2])).toThrow(/同时/);
  });

  it("cells 编辑后函数同步", () => {
    const fn = functionFromExpression("A & B");
    const next = withCellValue(fn, 0, 1);
    expect(mintermList(next)).toEqual([0, 3]);
    expect(next.source).toBe("table");
  });
});

describe("等价性", () => {
  it("吸收律：A·B + A·¬B = A", () => {
    const a = functionFromExpression("A & B | A & !B");
    const b = functionFromExpression("A");
    expect(areEquivalent(a, b).equivalent).toBe(true);
  });

  it("不同函数判定为不等价", () => {
    const a = functionFromExpression("A & B");
    const b = functionFromExpression("A | B");
    const result = areEquivalent(a, b);
    expect(result.equivalent).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it("无关项行不参与比对", () => {
    const a = functionFromMinterms(["A", "B"], [0], [1, 2, 3]);
    const b = functionFromMinterms(["A", "B"], [0, 3], []);
    expect(areEquivalent(a, b).equivalent).toBe(true);
    expect(areEquivalent(a, b).skippedRows).toBe(3);
  });

  it("规范式生成", () => {
    const fn = functionFromExpression("A & B");
    expect(canonicalSOP(fn)).toBe("A·B");
    expect(canonicalSOP(functionFromExpression("0"))).toBe("0");
  });
});

describe("最小项记号输入", () => {
  it("解析 Σm 与 Σd", () => {
    const parsed = tryParseMintermNotation("F(A,B,C) = Σm(1,3,5) + Σd(2,6)");
    expect(parsed).not.toBeNull();
    expect(parsed?.variables).toEqual(["A", "B", "C"]);
    expect(parsed?.minterms).toEqual([1, 3, 5]);
    expect(parsed?.dontCares).toEqual([2, 6]);
  });

  it("未声明变量时按最大编号推断", () => {
    const parsed = tryParseMintermNotation("Σm(0,2,8,10)");
    expect(parsed?.variables).toBeNull();
    expect(parsed?.inferredVariables).toBe(4);
  });

  it("普通表达式不会被误判", () => {
    expect(tryParseMintermNotation("A & B")).toBeNull();
  });

  it("支持中文逗号", () => {
    const parsed = tryParseMintermNotation("Σm(1，3，5)");
    expect(parsed?.minterms).toEqual([1, 3, 5]);
  });
});

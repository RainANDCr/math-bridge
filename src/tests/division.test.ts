import { describe, expect, it } from "vitest";
import { functionFromExpression } from "../core/boolean/model";
import { minimizeValues, evaluateSopAt } from "../core/karnaugh/minimizer";
import {
  booleanDivide,
  bestBooleanFactors,
  cubeFromLiterals,
  pruneRedundantTerms,
  twoLevelLiterals,
  type Divisor,
} from "../core/karnaugh/division";
import { termToString } from "../core/karnaugh/implicants";

const cube = (expression: string) => {
  const fn = functionFromExpression(expression);
  const min = minimizeValues(fn.variables, fn.values);
  return { fn, min };
};

/** 手工构造单个乘积项（只用于测试） */
function term(variables: string[], literals: Array<[string, boolean]>) {
  return cubeFromLiterals(
    literals.map(([variable, negated]) => ({ variable, negated })),
    variables
  );
}

function holds(divisor: Divisor, row: number, variables: string[]): boolean {
  const bit = (variable: string) => {
    const position = variables.indexOf(variable);
    return ((row >> (variables.length - 1 - position)) & 1) === 1;
  };
  const value = (literal: { variable: string; negated: boolean }) =>
    literal.negated ? !bit(literal.variable) : bit(literal.variable);
  return divisor.kind === "cube"
    ? divisor.literals.every(value)
    : divisor.literals.some(value);
}

describe("冗余项（共识项）", () => {
  it("A·B + ¬A·C + B·C 里的 B·C 是共识项，可以删掉", () => {
    const { fn, min } = cube("(A & B) | (!A & C)");
    const consensus = term(fn.variables, [
      ["B", false],
      ["C", false],
    ]);
    const { terms, removed } = pruneRedundantTerms(fn.variables, fn.values, [
      ...min.terms,
      consensus,
    ]);
    expect(removed).toHaveLength(1);
    expect(termToString(removed[0].cube.literals)).toBe("B·C");
    expect(terms).toHaveLength(2);
  });

  it("已经最小的覆盖里没有冗余项", () => {
    const { fn, min } = cube("(A & B) | (!A & C)");
    const { removed, terms } = pruneRedundantTerms(fn.variables, fn.values, min.terms);
    expect(removed).toHaveLength(0);
    expect(terms).toHaveLength(2);
  });

  it("删掉冗余项后函数不变（逐行比对）", () => {
    const { fn, min } = cube("(A & B) | (!A & C)");
    const consensus = term(fn.variables, [
      ["B", false],
      ["C", false],
    ]);
    const { terms } = pruneRedundantTerms(fn.variables, fn.values, [...min.terms, consensus]);
    for (let row = 0; row < fn.values.length; row += 1) {
      expect(evaluateSopAt(fn.variables, terms, row)).toBe(fn.values[row] === 1);
    }
  });
});

describe("布尔除法", () => {
  it("代数除法提不出的 (A+C) 因子，布尔除法能整除", () => {
    const { fn, min } = cube("(A & B) | (!A & C)");
    // 两个项没有公共文字：A·B 与 ¬A·C
    expect(min.terms.map((item) => item.literals.length)).toEqual([2, 2]);

    const divisor: Divisor = {
      kind: "clause",
      literals: [
        { variable: "A", negated: false },
        { variable: "C", negated: false },
      ],
    };
    const result = booleanDivide(fn.variables, fn.values, min.terms, divisor);
    expect(result.implied).toBe(true);
    expect(result.exact).toBe(true);
    expect(result.remainder).toHaveLength(0);
    expect(result.quotient.length).toBeGreaterThan(0);

    // 逐行验证 D·Q = F
    for (let row = 0; row < fn.values.length; row += 1) {
      const product =
        holds(result.divisor, row, fn.variables) &&
        evaluateSopAt(fn.variables, result.quotient, row);
      expect(product).toBe(fn.values[row] === 1);
    }
  });

  it("除式不是被除式的蕴含项时，余式非空", () => {
    const { fn, min } = cube("(A & B) | (!A & C)");
    const divisor: Divisor = {
      kind: "clause",
      literals: [
        { variable: "A", negated: false },
        { variable: "B", negated: false },
      ],
    };
    const result = booleanDivide(fn.variables, fn.values, min.terms, divisor);
    // m1 处 F=1 但 A+B=0
    expect(result.implied).toBe(false);
    expect(result.exact).toBe(false);
    expect(result.remainder.length).toBeGreaterThan(0);
  });

  it("用单文字乘积项整除：A 除 A·B + A·C 得 B + C", () => {
    const { fn, min } = cube("(A & B) | (A & C)");
    const divisor: Divisor = { kind: "cube", literals: [{ variable: "A", negated: false }] };
    const result = booleanDivide(fn.variables, fn.values, min.terms, divisor);
    expect(result.exact).toBe(true);
    expect(result.quotient).toHaveLength(2);
    const text = result.quotient.map((item) => termToString(item.literals)).sort();
    expect(text).toEqual(["B", "C"]);
  });

  it("找因子：在乘积项与单/双文字和项里挑出最省的精确除式", () => {
    const { fn, min } = cube("(A & B) | (!A & C)");
    const factors = bestBooleanFactors(fn.variables, fn.values, min.terms);
    expect(factors.length).toBeGreaterThan(0);
    // (A + C) 是那个经典因子
    expect(factors.some((factor) => factor.divisorText === "(A + C)")).toBe(true);
    // 所有返回的因子都必须真的整除
    for (const factor of factors) {
      expect(factor.exact).toBe(true);
    }
    // 两级形式的文字数作为参照，界面用它判断「值不值得换」
    expect(twoLevelLiterals(min.terms)).toBe(4);
  });

  it("常数与单项函数不会崩", () => {
    for (const expression of ["1", "0", "A"]) {
      const fn = functionFromExpression(expression);
      const min = minimizeValues(fn.variables, fn.values);
      const factors = bestBooleanFactors(fn.variables, fn.values, min.terms);
      for (const factor of factors) expect(factor.exact).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { functionFromExpression } from "../core/boolean/model";
import { minimizeValues, minimizePosValues, evaluateSopAt } from "../core/karnaugh/minimizer";
import { analyzeHazards } from "../core/karnaugh/hazards";
import { termToString } from "../core/karnaugh/implicants";

function analyze(expression: string) {
  const fn = functionFromExpression(expression);
  const sop = minimizeValues(fn.variables, fn.values);
  const pos = minimizePosValues(fn.variables, fn.values);
  return {
    fn,
    sop,
    pos,
    report: analyzeHazards(
      fn.variables,
      fn.values,
      sop.terms,
      pos.clauses.map((clause) => clause.cube)
    ),
  };
}

describe("静态-1 冒险（SOP）", () => {
  it("A·B + ¬A·C 是教科书上的经典冒险：A 变化时两项交接不上", () => {
    const { report } = analyze("(A & B) | (!A & C)");
    expect(report.ones.hazards.length).toBe(1);
    const hazard = report.ones.hazards[0];
    // m3 = A=0,B=1,C=1 与 m7 = A=1,B=1,C=1 只差 A 一位
    expect(hazard.cells).toEqual([3, 7]);
    expect(hazard.variable).toBe("A");
    expect(report.hasHazards).toBe(true);
  });

  it("共识项 B·C 能消掉这处冒险", () => {
    const { report } = analyze("(A & B) | (!A & C)");
    const added = report.ones.repair.added.map((cube) => termToString(cube.literals)).sort();
    expect(added).toEqual(["B·C"]);
    // 修复后不再有冒险，且仍然覆盖原来每一个 1 格
    expect(report.ones.repair.terms.length).toBe(3);
    expect(report.ones.repair.expression).toContain("B·C");
  });

  it("修复后的覆盖与原函数等价（逐行比对）", () => {
    const { fn, report } = analyze("(A & B) | (!A & C)");
    for (let row = 0; row < fn.values.length; row += 1) {
      const value = evaluateSopAt(fn.variables, report.ones.repair.terms, row);
      expect(value).toBe(fn.values[row] === 1);
    }
  });

  it("共享一项时没有冒险：A·B + A·C 的两对相邻格都被同一项覆盖", () => {
    const { report } = analyze("(A & B) | (A & C)");
    expect(report.ones.hazards).toHaveLength(0);
    expect(report.ones.checkedPairs).toBeGreaterThan(0);
    expect(report.ones.repair.added).toHaveLength(0);
  });

  it("单个乘积项不可能有静态冒险", () => {
    const { report } = analyze("A & B & C");
    expect(report.ones.hazards).toHaveLength(0);
  });

  it("无关项不参与静态冒险检测", () => {
    const fn = functionFromExpression("(A & B) | (!A & C)");
    const values = fn.values.map((value, index) => (index === 3 ? "X" : value));
    const sop = minimizeValues(fn.variables, values);
    const report = analyzeHazards(fn.variables, values, sop.terms, []);
    // m3 变成 X 后，m3–m7 这一对不再是「两个 1 格」
    expect(report.ones.hazards).toHaveLength(0);
  });

  it("全 1 函数没有冒险：一个空立方体覆盖整张图", () => {
    const { report } = analyze("A | !A");
    expect(report.ones.hazards).toHaveLength(0);
  });
});

describe("静态-0 冒险（POS）", () => {
  it("(A+B)(¬A+C) 在 0 格侧有冒险，补上和项 B+C", () => {
    const { report } = analyze("(A | B) & (!A | C)");
    expect(report.zeros.hazards.length).toBeGreaterThan(0);
    expect(report.zeros.repair.added.length).toBeGreaterThan(0);
    const expression = report.zeros.repair.expression;
    // 和项里的文字是「取反后」的写法，不能双重取反
    expect(expression).toContain("(B + C)");
    expect(expression).not.toContain("(¬B + ¬C)");
  });

  it("0 格修复后的和之积与原函数逐行一致", () => {
    const { fn, report } = analyze("(A | B) & (!A | C)");
    const clauses = report.zeros.repair.terms.map((cube) =>
      cube.literals.map((literal) => ({ ...literal, negated: !literal.negated }))
    );
    for (let row = 0; row < fn.values.length; row += 1) {
      const value = clauses.every((literals) =>
        literals.some((literal) => {
          const position = fn.variables.indexOf(literal.variable);
          const bit = ((row >> (fn.variables.length - 1 - position)) & 1) === 1;
          return literal.negated ? !bit : bit;
        })
      );
      expect(value).toBe(fn.values[row] === 1);
    }
  });
});

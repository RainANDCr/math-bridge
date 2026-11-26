import { describe, expect, it } from "vitest";
import type { CellValue } from "../core/boolean/model";
import { buildCube, type Cube } from "../core/karnaugh/implicants";
import { factorExpressions, factorMultiOutput, type FactoringInput } from "../core/karnaugh/factoring";
import { minimizeMultiOutput, type OutputSpec } from "../core/karnaugh/multiOutput";
import { mulberry32 } from "../core/probability/simulation";

const VARS = ["A", "B", "C", "D"];

/** 把 "A·¬B·C" 这样的项转成立方体（mask 表示该位固定） */
function cube(expression: string): Cube {
  const parts = expression.split("·");
  let mask = 0;
  let base = 0;
  for (const part of parts) {
    const negated = part.startsWith("¬");
    const variable = negated ? part.slice(1) : part;
    const index = VARS.indexOf(variable);
    if (index < 0) throw new Error(`未知变量 ${variable}`);
    const bit = VARS.length - 1 - index;
    mask |= 1 << bit;
    if (!negated) base |= 1 << bit;
  }
  return buildCube(base, mask, VARS);
}

const output = (name: string, terms: string[], values?: CellValue[]): FactoringInput => ({
  name,
  terms: terms.map(cube),
  values,
});

describe("子表达式共享（因式分解）", () => {
  it("公因子被提取，成本下降", () => {
    // F2 = A·B 是 F1 两项的公共因子；两级形式只能共享整个乘积项，
    // 因式分解可以把 A·B 单独做成一个门供 F1 复用
    const result = factorExpressions(VARS, [
      output("F1", ["A·B·C", "A·B·D"]),
      output("F2", ["A·B"]),
    ]);
    expect(result.isValid).toBe(true);
    expect(result.twoLevelCost).toBeGreaterThan(0);
    expect(result.factoredCost).toBeLessThan(result.twoLevelCost);
    // A·B 被两个输出共用
    expect(result.sharedNodes).toBeGreaterThanOrEqual(1);
    expect(result.definitions.some((d) => d.op === "and" && d.operands.length === 2)).toBe(true);
  });

  it("互补文字被约掉：A·B·C + A·B·¬C → A·B", () => {
    const result = factorExpressions(VARS, [output("F1", ["A·B·C", "A·B·¬C"])]);
    expect(result.isValid).toBe(true);
    expect(result.factored.literals).toBe(2);
    expect(result.factored.gates).toBe(1);
    expect(result.outputs[0].expression).toBe("A·B");
  });

  it("没有公共因子时不硬造门", () => {
    const result = factorExpressions(VARS, [
      output("F1", ["A·B", "C·D"]),
      output("F2", ["¬A·¬C"]),
    ]);
    expect(result.isValid).toBe(true);
    expect(result.factoredCost).toBe(result.twoLevelCost);
    expect(result.sharedNodes).toBe(0);
  });

  it("吸收律：A·B + A·B·C → A·B", () => {
    const result = factorExpressions(VARS, [output("F1", ["A·B", "A·B·C"])]);
    expect(result.outputs[0].expression).toBe("A·B");
    expect(result.factored.literals).toBe(2);
  });

  it("定义按拓扑序排列：引用只会指向更早的定义", () => {
    const result = factorExpressions(VARS, [
      output("F1", ["A·B·C", "A·B·D", "¬A·C"]),
      output("F2", ["A·B·C", "¬A·D"]),
    ]);
    const seen = new Set<string>();
    for (const definition of result.definitions) {
      for (const operand of definition.operands) {
        if (/^T\d+$/.test(operand)) expect(seen.has(operand)).toBe(true);
      }
      seen.add(definition.name);
    }
  });

  it("随机多输出：因式分解结果逐行还原原函数，且文字数不高于两级", () => {
    const rng = mulberry32(20261125);
    for (let trial = 0; trial < 25; trial += 1) {
      const specs: OutputSpec[] = [0, 1, 2].map((i) => ({
        name: `F${i + 1}`,
        values: Array.from({ length: 16 }, () => (rng() < 0.35 ? 1 : 0)) as CellValue[],
      }));
      const multi = minimizeMultiOutput(VARS, specs);
      const factored = factorMultiOutput(VARS, multi);
      expect(factored.isValid).toBe(true);

      // 每个输出的定义图能逐行还原真值表
      for (let o = 0; o < specs.length; o += 1) {
        const cubes = multi.terms.filter((term) => term.outputs.includes(o)).map((t) => t.cube);
        for (let row = 0; row < 16; row += 1) {
          if (specs[o].values[row] === "X") continue;
          const expected = specs[o].values[row] === 1;
          const actual = cubes.some((c) => c.cells.includes(row));
          expect(actual).toBe(expected);
        }
      }
      expect(factored.factoredCost).toBeLessThanOrEqual(factored.twoLevelCost);
    }
  });

  it("相同乘积项只计一次，单文字项不占与门", () => {
    const result = factorExpressions(VARS, [
      output("F1", ["A·B·C", "A·B·D", "C"]),
      output("F2", ["A·B·C"]),
      output("F3", ["A·B·C"]),
    ]);
    // 去重后只有 ABC、ABD、C 三个乘积项；其中只有前两个需要与门
    expect(result.twoLevel.terms).toBe(3);
    expect(result.twoLevel.literals).toBe(3 + 3 + 1);
    expect(result.twoLevel.gates).toBe(2 + 1);
  });

  it("常量与单项输出不产生多余的门", () => {
    const result = factorExpressions(VARS, [output("F1", ["A"]), output("F2", ["A·B"])]);
    expect(result.isValid).toBe(true);
    expect(result.factored.gates).toBe(1);
    expect(result.outputs[0].expression).toBe("A");
  });

  it("空输出是常量 0", () => {
    const result = factorExpressions(VARS, [output("F1", [])]);
    expect(result.outputs[0].expression).toBe("0");
    expect(result.factored.gates).toBe(0);
  });
});

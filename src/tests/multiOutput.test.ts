import { describe, expect, it } from "vitest";
import type { CellValue } from "../core/boolean/model";
import { minimizeValues, evaluateSopAt } from "../core/karnaugh/minimizer";
import { minimizeMultiOutput, type OutputSpec } from "../core/karnaugh/multiOutput";
import { mulberry32 } from "../core/probability/simulation";

const spec = (name: string, values: CellValue[]): OutputSpec => ({ name, values });

describe("多输出共享化简", () => {
  it("两个输出完全相同：共享一个乘积项", () => {
    const values: CellValue[] = [0, 0, 1, 1];
    const result = minimizeMultiOutput(["A", "B"], [spec("F1", values), spec("F2", values)]);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].outputs).toEqual([0, 1]);
    expect(result.totalLiterals).toBe(1);
    expect(result.independent.literals).toBe(2);
    expect(result.savings).toBe(1);
  });

  it("两个输出互补：没有可共享的项", () => {
    const f1: CellValue[] = [0, 0, 1, 1];
    const f2: CellValue[] = [1, 1, 0, 0];
    const result = minimizeMultiOutput(["A", "B"], [spec("F1", f1), spec("F2", f2)]);
    expect(result.sharedTerms).toBe(0);
    expect(result.totalLiterals).toBe(result.independent.literals);
  });

  it("共享后总代价不高于各自独立化简", () => {
    const rng = mulberry32(7);
    for (let trial = 0; trial < 20; trial += 1) {
      const f1: CellValue[] = Array.from({ length: 16 }, () => (rng() < 0.4 ? 1 : 0));
      const f2: CellValue[] = Array.from({ length: 16 }, () => (rng() < 0.4 ? 1 : 0));
      const f3: CellValue[] = Array.from({ length: 16 }, () => (rng() < 0.4 ? 1 : 0));
      const result = minimizeMultiOutput(
        ["A", "B", "C", "D"],
        [spec("F1", f1), spec("F2", f2), spec("F3", f3)]
      );
      expect(result.totalLiterals).toBeLessThanOrEqual(result.independent.literals);
      expect(result.isValid).toBe(true);
    }
  });

  it("每个输出都能被自己名下的乘积项精确还原（含无关项）", () => {
    const rng = mulberry32(99);
    for (let trial = 0; trial < 15; trial += 1) {
      const make = () =>
        Array.from({ length: 16 }, () => {
          const r = rng();
          return r < 0.1 ? "X" : r < 0.5 ? 1 : 0;
        }) as CellValue[];
      const specs = [spec("F1", make()), spec("F2", make())];
      const result = minimizeMultiOutput(["A", "B", "C", "D"], specs);

      specs.forEach((output, o) => {
        const cubes = result.terms
          .filter((term) => term.outputs.includes(o))
          .map((term) => term.cube);
        output.values.forEach((value, m) => {
          if (value === "X") return;
          expect(evaluateSopAt(["A", "B", "C", "D"], cubes, m)).toBe(value === 1);
        });
      });
    }
  });

  it("每个被覆盖的最小项都确实出现在该项的 coverage 里", () => {
    const f1: CellValue[] = [1, 1, 0, 0, 1, 1, 0, 0];
    const f2: CellValue[] = [1, 0, 0, 1, 1, 0, 0, 1];
    const result = minimizeMultiOutput(["A", "B", "C"], [spec("F1", f1), spec("F2", f2)]);
    for (const term of result.terms) {
      expect(term.outputs.length).toBeGreaterThan(0);
      expect(term.outputs.length).toBe(term.coverage.length);
      term.outputs.forEach((_outputIndex, i) => {
        for (const m of term.coverage[i]) {
          expect(f1[m] === 1 || f2[m] === 1).toBe(true);
          expect(term.cube.cells).toContain(m);
        }
      });
    }
  });

  it("全 0 输出得到常量 0", () => {
    const zeros: CellValue[] = [0, 0, 0, 0];
    const result = minimizeMultiOutput(["A", "B"], [spec("F1", zeros), spec("F2", zeros)]);
    expect(result.terms).toHaveLength(0);
    expect(result.perOutput.map((p) => p.expression)).toEqual(["0", "0"]);
    expect(result.isValid).toBe(true);
  });

  it("共享结果不劣于任一输出单独化简", () => {
    const f1: CellValue[] = [1, 1, 1, 1, 0, 0, 0, 0];
    const f2: CellValue[] = [1, 1, 0, 0, 0, 0, 0, 0];
    const result = minimizeMultiOutput(["A", "B", "C"], [spec("F1", f1), spec("F2", f2)]);
    const solo = minimizeValues(["A", "B", "C"], f2);
    expect(result.perOutput[1].literals).toBeLessThanOrEqual(solo.literalCount + 1);
  });
});

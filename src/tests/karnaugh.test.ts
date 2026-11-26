import { describe, expect, it } from "vitest";
import {
  binaryToGray,
  grayCodeSequence,
  grayToBinary,
  isAdjacent,
  toBits,
} from "../core/karnaugh/grayCode";
import {
  buildKMapLayout,
  cellAssignment,
  locateMinterm,
  visuallyAdjacent,
} from "../core/karnaugh/mapping";
import {
  allowedSetOf,
  cubeFromCells,
  expandMask,
  primeImplicants,
} from "../core/karnaugh/implicants";
import { minimizeValues, minimizePosValues, explainGroup } from "../core/karnaugh/minimizer";
import { traceGroupOutline, tracePlaneOutline } from "../core/karnaugh/outline";
import { quineMcCluskey } from "../core/karnaugh/quineMcCluskey";
import { validateSop, validatePos } from "../core/karnaugh/validation";
import {
  functionFromExpression,
  functionFromMinterms,
  functionFromValues,
  type CellValue,
} from "../core/boolean/model";
import { mulberry32 } from "../core/probability/simulation";

describe("格雷码", () => {
  it("1~3 位格雷码序列", () => {
    expect(grayCodeSequence(1)).toEqual([0, 1]);
    expect(grayCodeSequence(2)).toEqual([0, 1, 3, 2]);
    expect(grayCodeSequence(3)).toEqual([0, 1, 3, 2, 6, 7, 5, 4]);
  });

  it("二进制与格雷码互逆", () => {
    for (let i = 0; i < 64; i += 1) {
      expect(grayToBinary(binaryToGray(i))).toBe(i);
    }
  });

  it("相邻的格雷码只差一位", () => {
    const seq = grayCodeSequence(3);
    for (let i = 0; i < seq.length; i += 1) {
      expect(isAdjacent(seq[i], seq[(i + 1) % seq.length])).toBe(true);
    }
  });

  it("位数组与数字互相转换", () => {
    expect(toBits(5, 3)).toEqual([1, 0, 1]);
    expect(toBits(0, 2)).toEqual([0, 0]);
  });
});

describe("卡诺图布局", () => {
  it("三变量：2 行 4 列，行列均为格雷码", () => {
    const layout = buildKMapLayout(["A", "B", "C"]);
    expect(layout.rows.map((r) => r.label)).toEqual(["0", "1"]);
    expect(layout.cols.map((c) => c.label)).toEqual(["00", "01", "11", "10"]);
    expect(layout.cells).toEqual([
      [0, 1, 3, 2],
      [4, 5, 7, 6],
    ]);
  });

  it("四变量：4×4，行列都是 00 01 11 10", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D"]);
    expect(layout.rows.map((r) => r.label)).toEqual(["00", "01", "11", "10"]);
    expect(layout.cols.map((c) => c.label)).toEqual(["00", "01", "11", "10"]);
    expect(layout.cells[0]).toEqual([0, 1, 3, 2]);
    expect(layout.cells[1]).toEqual([4, 5, 7, 6]);
    expect(layout.cells[2]).toEqual([12, 13, 15, 14]);
    expect(layout.cells[3]).toEqual([8, 9, 11, 10]);
  });

  it("两变量：2×2", () => {
    const layout = buildKMapLayout(["A", "B"]);
    expect(layout.cells).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("单元格可以还原变量取值", () => {
    const layout = buildKMapLayout(["A", "B", "C"]);
    expect(cellAssignment(layout, 5)).toBe("A=1, B=0, C=1");
  });

  it("视觉相邻 ⇔ 编号只差一位（含环绕）", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D"]);
    for (let r1 = 0; r1 < 4; r1 += 1) {
      for (let c1 = 0; c1 < 4; c1 += 1) {
        for (let r2 = 0; r2 < 4; r2 += 1) {
          for (let c2 = 0; c2 < 4; c2 += 1) {
            if (r1 === r2 && c1 === c2) continue;
            const visual = visuallyAdjacent(layout, { row: r1, col: c1 }, { row: r2, col: c2 });
            const logical = isAdjacent(layout.cells[r1][c1], layout.cells[r2][c2]);
            if (visual !== logical) {
              throw new Error(
                `不一致：(${r1},${c1})=m${layout.cells[r1][c1]} 与 (${r2},${c2})=m${
                  layout.cells[r2][c2]
                }`
              );
            }
          }
        }
      }
    }
  });

  it("四角彼此相邻", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D"]);
    expect(visuallyAdjacent(layout, { row: 0, col: 0 }, { row: 0, col: 3 })).toBe(true);
    expect(visuallyAdjacent(layout, { row: 0, col: 0 }, { row: 3, col: 0 })).toBe(true);
    expect(visuallyAdjacent(layout, { row: 0, col: 0 }, { row: 3, col: 3 })).toBe(false);
  });
});

describe("手动分组校验", () => {
  const variables = ["A", "B", "C", "D"];

  it("合法 2 格分组", () => {
    const result = cubeFromCells([0, 1], variables, 4);
    expect(result.ok).toBe(true);
    expect(result.cube?.size).toBe(2);
  });

  it("拒绝非 2 的整数次幂", () => {
    const result = cubeFromCells([0, 1, 2], variables, 4);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("2 的整数次幂");
  });

  it("拒绝不相邻的格子", () => {
    const result = cubeFromCells([0, 3], variables, 4);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("不相邻");
  });

  it("接受四角环绕分组", () => {
    const result = cubeFromCells([0, 2, 8, 10], variables, 4);
    expect(result.ok).toBe(true);
    expect(result.cube?.literals.map((l) => `${l.negated ? "¬" : ""}${l.variable}`)).toEqual([
      "¬B",
      "¬D",
    ]);
  });

  it("接受整表分组", () => {
    const result = cubeFromCells(expandMask(0, 3), variables.slice(0, 3), 3);
    expect(result.ok).toBe(true);
    expect(result.cube?.literals).toEqual([]);
  });

  it("空选择给出提示", () => {
    expect(cubeFromCells([], variables, 4).reason).toContain("没有选中");
  });
});

describe("素蕴含项", () => {
  it("全 1 函数只有一个素蕴含项（全域立方体）", () => {
    const allowed = new Set(expandMask(0, 4));
    const primes = primeImplicants(["A", "B", "C", "D"], allowed);
    expect(primes).toHaveLength(1);
    expect(primes[0].literals).toEqual([]);
  });

  it("单个最小项对应一个三文字乘积项", () => {
    const allowed = new Set([5]);
    const primes = primeImplicants(["A", "B", "C"], allowed);
    expect(primes).toHaveLength(1);
    expect(primes[0].literals.length).toBe(3);
  });
});

describe("SOP 最小化", () => {
  it("(A&B)|C → C + A·B", () => {
    const fn = functionFromExpression("(A & B) | C");
    const result = minimizeValues(fn.variables, fn.values);
    expect(result.expression).toBe("C + A·B");
    expect(result.termCount).toBe(2);
    expect(result.literalCount).toBe(3);
    expect(validateSop(fn, result.terms).ok).toBe(true);
  });

  it("全部最小项 → 常量 1", () => {
    const result = minimizeValues(["A", "B"], [1, 1, 1, 1]);
    expect(result.expression).toBe("1");
  });

  it("没有最小项 → 常量 0", () => {
    const result = minimizeValues(["A", "B"], [0, 0, 0, 0]);
    expect(result.expression).toBe("0");
  });

  it("单变量合并：Σm(0,1) → ¬A", () => {
    expect(minimizeValues(["A", "B"], [1, 1, 0, 0]).expression).toBe("¬A");
  });

  it("异或：Σm(1,2) → ¬A·B + A·¬B", () => {
    expect(minimizeValues(["A", "B"], [0, 1, 1, 0]).expression).toBe("¬A·B + A·¬B");
  });

  it("单个最小项保留全部三个文字", () => {
    expect(minimizeValues(["A", "B", "C"], [0, 0, 0, 0, 0, 1, 0, 0]).expression).toBe("A·¬B·C");
  });

  it("跨左右边界环绕：Σm(0,1,4,5) → ¬B", () => {
    const values: Array<0 | 1> = [1, 1, 0, 0, 1, 1, 0, 0];
    expect(minimizeValues(["A", "B", "C"], values).expression).toBe("¬B");
  });

  it("四角环绕：Σm(0,2,8,10) → ¬B·¬D", () => {
    const values = new Array(16).fill(0);
    [0, 2, 8, 10].forEach((m) => {
      values[m] = 1;
    });
    expect(minimizeValues(["A", "B", "C", "D"], values).expression).toBe("¬B·¬D");
  });

  it("无关项参与化简：Σm(0,1,2)+d(3) → 1", () => {
    const values = [1, 1, 1, "X"] as CellValue[];
    expect(minimizeValues(["A", "B"], values).expression).toBe("1");
  });

  it("无关项不被强制覆盖：不相邻的 X 不会进入分组", () => {
    const withDc = minimizeValues(["A", "B"], [1, 0, 0, "X"] as CellValue[]);
    expect(withDc.expression).toBe("¬A·¬B");
    expect(withDc.literalCount).toBe(2);
  });

  it("等价解本身也是合法且同样最简的", () => {
    const values: Array<0 | 1> = [1, 1, 1, 1, 1, 1, 0, 0];
    const fn = functionFromValues(["A", "B", "C"], values);
    const result = minimizeValues(fn.variables, fn.values);
    for (const alternative of result.alternatives) {
      expect(validateSop(fn, alternative.terms).ok).toBe(true);
      expect(alternative.terms.length).toBe(result.termCount);
    }
  });

  it("给出分组解释", () => {
    const fn = functionFromExpression("(A & B) | C");
    const result = minimizeValues(fn.variables, fn.values);
    const cTerm = result.terms.find((t) => t.literals.length === 1);
    expect(cTerm).toBeDefined();
    const explanation = explainGroup(cTerm!, fn.variables);
    expect(explanation.kept).toEqual([{ variable: "C", value: 1 }]);
    expect(explanation.changed).toEqual(["A", "B"]);
  });
});

describe("POS 最小化", () => {
  it("(A&B)|C 的 POS 为 (A + C)·(B + C)", () => {
    const fn = functionFromExpression("(A & B) | C");
    const pos = minimizePosValues(fn.variables, fn.values);
    expect(pos.clauseCount).toBe(2);
    expect(pos.expression).toContain("(A + C)");
    expect(pos.expression).toContain("(B + C)");
    expect(validatePos(fn, pos.clauses).ok).toBe(true);
  });

  it("常量函数的 POS", () => {
    expect(minimizePosValues(["A", "B"], [1, 1, 1, 1]).expression).toBe("1");
    expect(minimizePosValues(["A", "B"], [0, 0, 0, 0]).expression).toBe("0");
  });

  it("POS 与 SOP 都通过真值表校验", () => {
    const fn = functionFromExpression("A ^ B ^ C");
    const sop = minimizeValues(fn.variables, fn.values);
    const pos = minimizePosValues(fn.variables, fn.values);
    expect(validateSop(fn, sop.terms).ok).toBe(true);
    expect(validatePos(fn, pos.clauses).ok).toBe(true);
  });
});

describe("穷举随机验证", () => {
  it("100 个随机四变量函数（含无关项）的化简结果与原函数逐行一致", () => {
    const rng = mulberry32(20260101);
    for (let trial = 0; trial < 100; trial += 1) {
      const values = Array.from({ length: 16 }, () => {
        const r = rng();
        if (r < 0.12) return "X" as const;
        return (r < 0.56 ? 1 : 0) as 0 | 1;
      });
      const fn = functionFromValues(["A", "B", "C", "D"], values);
      const sop = minimizeValues(fn.variables, fn.values);
      const report = validateSop(fn, sop.terms);
      if (!report.ok) {
        throw new Error(
          `第 ${trial} 个随机函数化简失败：${sop.expression}，不一致 ${JSON.stringify(
            report.mismatches.slice(0, 3)
          )}`
        );
      }
      expect(sop.isValid).toBe(true);

      const pos = minimizePosValues(fn.variables, fn.values);
      const posReport = validatePos(fn, pos.clauses);
      if (!posReport.ok) {
        throw new Error(`第 ${trial} 个随机函数的 POS 校验失败：${pos.expression}`);
      }
    }
  });

  it("化简结果不会覆盖任何 0 格", () => {
    const rng = mulberry32(7);
    for (let trial = 0; trial < 40; trial += 1) {
      const values = Array.from({ length: 8 }, () => (rng() < 0.5 ? 1 : 0) as 0 | 1);
      const fn = functionFromValues(["A", "B", "C"], values);
      const result = minimizeValues(fn.variables, fn.values);
      expect(validateSop(fn, result.terms).ok).toBe(true);
    }
  });
});

describe("函数与卡诺图的一致性", () => {
  it("卡诺图格子编号覆盖 0..2^n-1 且不重复", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D"]);
    const flat = layout.cells.flat().sort((a, b) => a - b);
    expect(flat).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it("允许集合包含 1 与 X", () => {
    const fn = functionFromMinterms(["A", "B"], [1], [2]);
    const allowed = allowedSetOf(fn);
    expect(Array.from(allowed).sort()).toEqual([1, 2]);
  });
});


describe("分组轮廓追踪", () => {
  const geom = { cellW: 66, cellH: 54, originX: 54, originY: 34 };

  it("单个格子形成一条闭合路径", () => {
    const layout = buildKMapLayout(["A", "B"]);
    const paths = traceGroupOutline([0], layout, geom);
    expect(paths).toHaveLength(1);
    expect(paths[0].startsWith("M ")).toBe(true);
    expect(paths[0].endsWith("Z")).toBe(true);
  });

  it("2×2 分组是一个环，而不是四个小方块", () => {
    const layout = buildKMapLayout(["A", "B", "C"]);
    const paths = traceGroupOutline([1, 3, 5, 7], layout, geom);
    expect(paths).toHaveLength(1);
  });

  it("四角分组分裂成四个环", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D"]);
    const paths = traceGroupOutline([0, 2, 8, 10], layout, geom);
    expect(paths).toHaveLength(4);
  });

  it("跨左右边界的分组分裂成两个环", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D"]);
    // m0 与 m2 位于第 0 行的最左列与最右列
    const paths = traceGroupOutline([0, 2], layout, geom);
    expect(paths).toHaveLength(2);
  });

  it("整表分组只有一条外圈路径", () => {
    const layout = buildKMapLayout(["A", "B"]);
    const paths = traceGroupOutline([0, 1, 2, 3], layout, geom);
    expect(paths).toHaveLength(1);
  });

  it("L 形分组的边界能连成一条环", () => {
    // 2 变量时 m0/m1/m2 构成一个 L 形
    const layout = buildKMapLayout(["A", "B"]);
    const paths = traceGroupOutline([0, 1, 2], layout, geom);
    expect(paths).toHaveLength(1);
    // L 形边界共 8 个顶点
    expect(paths[0].split("L")).toHaveLength(8);
  });
});

describe("Quine–McCluskey 合并表", () => {
  const keySet = (items: Array<{ base: number; mask: number }>) =>
    [...new Set(items.map((i) => `${i.base & i.mask}/${i.mask}`))].sort();

  it("两变量：Σm(1,3) 一步合并成 B", () => {
    const process = quineMcCluskey(["A", "B"], [0, 1, 0, 1]);
    expect(process.rounds).toHaveLength(2);
    expect(process.rounds[0].merges).toHaveLength(1);
    expect(process.rounds[0].merges[0].variable).toBe("A");
    expect(process.primes).toHaveLength(1);
    expect(process.primes[0].expression).toBe("B");
  });

  it("三变量：每一步合并只消去一个变量", () => {
    const process = quineMcCluskey(["A", "B", "C"], [1, 1, 1, 1, 0, 0, 0, 0]);
    expect(process.primes).toHaveLength(1);
    expect(process.primes[0].expression).toBe("¬A");
    expect(process.primes[0].sourceCount).toBe(4);
    // 第 1 轮 4 对，第 2 轮 2 对（都指向同一个 4 格组，但两对都要如实记录）
    expect(process.mergeCount).toBe(6);
    expect(process.rounds).toHaveLength(3);
  });

  it("无关项参与合并，但不出现在覆盖表的列里", () => {
    const process = quineMcCluskey(["A", "B"], [1, 1, 1, "X"]);
    expect(process.primes).toHaveLength(1);
    expect(process.primes[0].expression).toBe("1");
    expect(process.columns).toEqual([0, 1, 2]);
  });

  it("必需项与覆盖次数一致", () => {
    // 三个孤立的 1，每个只能被自身覆盖
    const process = quineMcCluskey(["A", "B", "C"], [1, 0, 0, 1, 0, 1, 0, 0]);
    expect(process.essentialColumns.sort()).toEqual([0, 3, 5]);
    expect(process.rows.filter((r) => r.essential)).toHaveLength(3);
  });

  it("与立方体枚举法给出同一批素蕴含项（随机 2~4 变量）", () => {
    const rng = mulberry32(20260101);
    for (let n = 2; n <= 4; n += 1) {
      const variables = ["A", "B", "C", "D"].slice(0, n);
      const total = 1 << n;
      for (let trial = 0; trial < 30; trial += 1) {
        const values: CellValue[] = Array.from({ length: total }, () =>
          rng() < 0.12 ? "X" : rng() < 0.5 ? 1 : 0
        );
        const expected = primeImplicants(variables, allowedSetOf(functionFromValues(variables, values)));
        const actual = quineMcCluskey(variables, values).primes;
        expect(keySet(actual)).toEqual(keySet(expected));
      }
    }
  });

  it("标记出最小化器实际选用的项", () => {
    const values: CellValue[] = [1, 1, 0, 0, 1, 1, 0, 0];
    const result = minimizeValues(["A", "B", "C"], values);
    const process = quineMcCluskey(["A", "B", "C"], values, result.terms);
    const chosen = process.rows.filter((r) => r.chosen);
    expect(chosen.map((r) => r.expression).sort()).toEqual(
      result.terms.map((t) => t.literals.map((l) => `${l.negated ? "¬" : ""}${l.variable}`).join("·")).sort()
    );
  });
});

describe("5–6 变量：多平面布局", () => {
  it("5 变量拆成两页 4×4，页标签是 E=0 / E=1", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E"]);
    expect(layout.rowVariables).toEqual(["A", "B"]);
    expect(layout.colVariables).toEqual(["C", "D"]);
    expect(layout.planeVariables).toEqual(["E"]);
    expect(layout.planes).toHaveLength(2);
    expect(layout.planes.map((p) => p.label)).toEqual(["E=0", "E=1"]);
  });

  it("每页的 minterm 连续且覆盖全部编号", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E"]);
    const all: number[] = [];
    layout.planes.forEach((plane) => plane.cells.forEach((row) => all.push(...row)));
    expect([...all].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 32 }, (_, i) => i)
    );
    expect(new Set(all).size).toBe(32);
    expect(layout.planes[0].cells[0][0]).toBe(0);
    // E 是最低位：同一行列位置上，E=1 的 minterm 只比 E=0 大 1
    expect(layout.planes[1].cells[0][0]).toBe(1);
    // 第 1 行是 B=1（行格雷码 01），所以是 01000 | 1 = 9
    expect(layout.planes[1].cells[1][0]).toBe(9);
  });

  it("6 变量四页按格雷码排列，页标签是 00/01/11/10", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E", "F"]);
    expect(layout.planes).toHaveLength(4);
    expect(layout.planes.map((p) => p.label)).toEqual([
      "E=0　F=0",
      "E=0　F=1",
      "E=1　F=1",
      "E=1　F=0",
    ]);
    // EF 是最低两位：页 10 的第一格是 m2
    expect(layout.planes[3].cells[0][0]).toBe(2);
  });

  it("locateMinterm 能回到正确的页", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E", "F"]);
    expect(locateMinterm(layout, 0)).toEqual({ plane: 0, row: 0, col: 0 });
    // 全 1 位于三张格雷表的最后一个位置：页 11 是第 2 页，行 11 是第 2 行，列 11 是第 2 列
    expect(locateMinterm(layout, 63)).toEqual({ plane: 2, row: 2, col: 2 });
    // m17 = 010001 → A=0,B=1,C=0,D=0,E=0,F=1 → 行 01、列 00、页 01（第 1 页）
    expect(locateMinterm(layout, 17)).toEqual({ plane: 1, row: 1, col: 0 });
  });

  it("「可视相邻」与「minterm 只差一位」完全等价（5 变量）", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E"]);
    const points = layout.planes.flatMap((plane) =>
      plane.cells.flatMap((row, r) => row.map((m, c) => ({ m, plane: plane.index, row: r, col: c })))
    );
    for (const a of points) {
      for (const b of points) {
        if (a.m >= b.m) continue;
        const geometric = visuallyAdjacent(
          layout,
          { plane: a.plane, row: a.row, col: a.col },
          { plane: b.plane, row: b.row, col: b.col }
        );
        expect(geometric).toBe(isAdjacent(a.m, b.m));
      }
    }
  });

  it("「可视相邻」与「minterm 只差一位」完全等价（6 变量）", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E", "F"]);
    const points = layout.planes.flatMap((plane) =>
      plane.cells.flatMap((row, r) => row.map((m, c) => ({ m, plane: plane.index, row: r, col: c })))
    );
    let mismatches = 0;
    for (const a of points) {
      for (const b of points) {
        if (a.m >= b.m) continue;
        const geometric = visuallyAdjacent(
          layout,
          { plane: a.plane, row: a.row, col: a.col },
          { plane: b.plane, row: b.row, col: b.col }
        );
        if (geometric !== isAdjacent(a.m, b.m)) mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("跨页分组在两页各画一段轮廓", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E"]);
    const geom = { cellW: 48, cellH: 42, originX: 44, originY: 48 };
    // m0 与 m1 只差 E，跨两页但属于同一个合法分组
    expect(tracePlaneOutline([0, 1], layout, 0, geom)).toHaveLength(1);
    expect(tracePlaneOutline([0, 1], layout, 1, geom)).toHaveLength(1);
    // 只落在第 0 页的组，在第 1 页没有轮廓
    expect(tracePlaneOutline([0, 2], layout, 1, geom)).toHaveLength(0);
  });

  it("6 变量化简结果仍能通过逐行验证", () => {
    const values: CellValue[] = Array.from({ length: 64 }, (_, i) => (i % 7 === 0 ? 1 : 0));
    const result = minimizeValues(["A", "B", "C", "D", "E", "F"], values);
    const report = validateSop(
      functionFromValues(["A", "B", "C", "D", "E", "F"], values),
      result.terms
    );
    expect(report.ok).toBe(true);
  });
});

describe("多平面布局的位序约定", () => {
  const variables = ["A", "B", "C", "D", "E", "F"];

  it.each([4, 5, 6])("%i 变量：每格的变量取值必须与行列页的格雷码一致", (count) => {
    const vars = variables.slice(0, count);
    const layout = buildKMapLayout(vars);
    const rowBits = layout.rowBits;
    const colBits = layout.colBits;
    for (const plane of layout.planes) {
      for (let r = 0; r < layout.rows.length; r += 1) {
        for (let c = 0; c < layout.cols.length; c += 1) {
          const m = plane.cells[r][c];
          const bits = toBits(m, count);
          // 变量顺序 A..F 依次对应二进制高位到低位
          expect(bits.slice(0, rowBits)).toEqual(layout.rows[r].bits);
          expect(bits.slice(rowBits, rowBits + colBits)).toEqual(layout.cols[c].bits);
          expect(bits.slice(rowBits + colBits)).toEqual(plane.bits);
        }
      }
    }
  });

  it("5 变量：E=0 页的 m1 确实是 D=1 而不是 E=1", () => {
    const layout = buildKMapLayout(["A", "B", "C", "D", "E"]);
    expect(cellAssignment(layout, layout.planes[0].cells[0][1])).toBe(
      "A=0, B=0, C=0, D=1, E=0"
    );
    expect(cellAssignment(layout, layout.planes[1].cells[0][0])).toBe(
      "A=0, B=0, C=0, D=0, E=1"
    );
  });
});

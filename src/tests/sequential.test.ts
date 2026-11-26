import { describe, expect, it } from "vitest";
import {
  deriveSequential,
  describeEncoding,
  excitationOf,
  outputAt,
  runSteps,
  searchEncodings,
  stateCode,
  stateCodesOf,
  stepState,
  verifyDerivation,
  type StateMachine,
} from "../core/sequential/machine";

const detector: StateMachine = {
  stateCount: 4,
  inputName: "X",
  // 连续两个 1 检测：S0 初始，S1 见到一个 1，S2 见到 11（输出 1），S3 未使用
  transitions: [
    [0, 1],
    [0, 2],
    [0, 2],
    [0, 0],
  ],
  outputs: [0, 0, 1, 0],
};

const counter: StateMachine = {
  stateCount: 4,
  inputName: "X",
  transitions: [
    [1, 1],
    [2, 2],
    [3, 3],
    [0, 0],
  ],
  outputs: [0, 0, 0, 1],
};

/** Mealy 版「连续两个 1」：输出与当前输入有关 */
const mealyDetector: StateMachine = {
  stateCount: 4,
  inputName: "X",
  machineType: "mealy",
  transitions: [
    [0, 1],
    [0, 2],
    [0, 2],
    [0, 0],
  ],
  // S1 且 X=1 时立刻输出 1（不等下一个时钟）
  outputs: [
    [0, 0],
    [0, 1],
    [0, 1],
    [0, 0],
  ],
};

describe("状态机 → 次态方程（D 触发器）", () => {
  it("次态方程逐行还原转移表", () => {
    expect(verifyDerivation(detector, deriveSequential(detector))).toBe(true);
    expect(verifyDerivation(counter, deriveSequential(counter))).toBe(true);
  });

  it("模 4 计数器：D0 就是 ¬Q0，D1 是异或", () => {
    const design = deriveSequential(counter);
    expect(design.bits.map((b) => b.d!.variable)).toEqual(["D1", "D0"]);
    expect(design.bits[1].d!.result.expression).toBe("¬Q0");
    // 异或写成两项与式，共 4 个文字
    expect(design.bits[0].d!.result.literalCount).toBe(4);
    expect(design.output.result.expression).toBe("Q1·Q0");
  });

  it("识别不可达状态", () => {
    const design = deriveSequential(detector);
    expect(design.reachable.sort()).toEqual([0, 1, 2]);
    expect(design.unreachable).toEqual([3]);
    expect(design.warnings.join("")).toContain("S3");
  });

  it("两状态机器只有一位状态变量", () => {
    const toggle: StateMachine = {
      stateCount: 2,
      inputName: "X",
      transitions: [
        [0, 1],
        [0, 1],
      ],
      outputs: [0, 1],
    };
    const design = deriveSequential(toggle);
    expect(design.stateBits).toBe(1);
    expect(design.stateVariables).toEqual(["Q0"]);
    expect(design.variables).toEqual(["Q0", "X"]);
    expect(design.bits[0].d!.variable).toBe("D0");
    expect(verifyDerivation(toggle, design)).toBe(true);
  });

  it("步进与批量步进一致", () => {
    const inputs = [1, 1, 0, 1, 0, 1, 1];
    const { steps, final } = runSteps(detector, 0, inputs);
    let state = 0;
    for (const step of steps) {
      expect(step.from).toBe(state);
      state = stepState(detector, state, step.input);
      expect(step.to).toBe(state);
    }
    expect(final).toBe(state);
    // 序列 1 1 → 到达 S2（输出 1）
    expect(steps[1].to).toBe(2);
  });

  it("状态编码补零", () => {
    expect(stateCode(0, 2)).toBe("00");
    expect(stateCode(3, 2)).toBe("11");
    expect(stateCode(1, 1)).toBe("1");
  });

  it("越界转移被夹回 S0，不会产生非法状态", () => {
    const broken: StateMachine = {
      stateCount: 2,
      inputName: "X",
      transitions: [
        [0, 5],
        [0, 1],
      ],
      outputs: [0, 1],
    };
    expect(stepState(broken, 0, 1)).toBe(0);
    expect(verifyDerivation(broken, deriveSequential(broken))).toBe(true);
  });
});

describe("Mealy 型", () => {
  it("输出方程包含输入变量", () => {
    const design = deriveSequential(mealyDetector);
    expect(design.output.dependsOnInput).toBe(true);
    expect(design.output.variables).toEqual(["Q1", "Q0", "X"]);
    expect(design.machineType).toBe("mealy");
  });

  it("输出逐行等于转移表上的值", () => {
    const design = deriveSequential(mealyDetector);
    expect(verifyDerivation(mealyDetector, design)).toBe(true);
    expect(outputAt(mealyDetector, 1, 0)).toBe(0);
    expect(outputAt(mealyDetector, 1, 1)).toBe(1);
  });

  it("同一个状态在不同输入下可以有不同输出（Moore 做不到）", () => {
    const design = deriveSequential(mealyDetector);
    expect(
      design.output.result.terms.some((term) =>
        term.literals.some((literal) => literal.variable === "X")
      )
    ).toBe(true);
  });

  it("Moore 的输出方程不含输入", () => {
    const design = deriveSequential(detector);
    expect(design.output.dependsOnInput).toBe(false);
    expect(design.output.variables).toEqual(["Q1", "Q0"]);
  });

  it("步进记录里带上当拍输出", () => {
    const { steps } = runSteps(mealyDetector, 0, [1, 1]);
    expect(steps[0].output).toBe(0); // S0 且 X=1
    expect(steps[1].output).toBe(1); // S1 且 X=1
  });
});

describe("JK 触发器", () => {
  it("激励表四行", () => {
    expect(excitationOf(0, 0)).toEqual({ j: 0, k: "X" });
    expect(excitationOf(0, 1)).toEqual({ j: 1, k: "X" });
    expect(excitationOf(1, 0)).toEqual({ j: "X", k: 1 });
    expect(excitationOf(1, 1)).toEqual({ j: "X", k: 0 });
  });

  it("JK 方程按特性方程还原转移表", () => {
    for (const machine of [detector, counter, mealyDetector]) {
      const design = deriveSequential({ ...machine, flipFlop: "JK" });
      expect(design.flipFlop).toBe("JK");
      expect(verifyDerivation({ ...machine, flipFlop: "JK" }, design)).toBe(true);
    }
  });

  it("每个状态位给出 J 与 K 两条方程", () => {
    const design = deriveSequential({ ...counter, flipFlop: "JK" });
    expect(design.equations.map((e) => e.variable)).toEqual(["J1", "K1", "J0", "K0", "Z"]);
    expect(design.bits[0].j).toBeDefined();
    expect(design.bits[0].k).toBeDefined();
  });

  it("JK 的无关项确实被用作无关项（不是强行填 0）", () => {
    const design = deriveSequential({ ...counter, flipFlop: "JK" });
    const jValues = design.bits[0].j!.values;
    expect(jValues.some((value) => value === "X")).toBe(true);
  });

  it("JK 的方程数比 D 多，但单项可以更简单", () => {
    const d = deriveSequential(counter);
    const jk = deriveSequential({ ...counter, flipFlop: "JK" });
    expect(jk.equations.length).toBe(d.equations.length * 2 - 1);
    // D0 = ¬Q0 需要 1 个文字；JK 里 J0 = 1、K0 = 1 只需 0 个文字
    expect(jk.bits[1].j!.result.literalCount + jk.bits[1].k!.result.literalCount).toBeLessThan(
      d.bits[1].d!.result.literalCount
    );
  });
});

describe("状态编码优化", () => {
  it("编码必须是 0..n-1 的排列，非法输入回退自然编码", () => {
    expect(stateCodesOf(detector)).toEqual([0, 1, 2, 3]);
    expect(stateCodesOf({ ...detector, stateCodes: [0, 0, 1, 2] })).toEqual([0, 1, 2, 3]);
    expect(stateCodesOf({ ...detector, stateCodes: [3, 1, 0, 2] })).toEqual([3, 1, 0, 2]);
  });

  it("每个编码都能还原同一台机器", () => {
    for (const codes of [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [0, 2, 3, 1],
      [2, 0, 3, 1],
    ]) {
      const machine = { ...detector, stateCodes: codes };
      expect(verifyDerivation(machine, deriveSequential(machine))).toBe(true);
    }
  });

  it("穷举 24 种编码，最优不劣于任意一种", () => {
    const search = searchEncodings(detector, 24);
    expect(search.total).toBe(24);
    expect(search.candidates).toHaveLength(24);
    const best = search.candidates[0].literals;
    expect(search.best).toBe(best);
    for (const candidate of search.candidates) {
      expect(candidate.literals).toBeGreaterThanOrEqual(best);
    }
  });

  it("基线代价与实际推导一致，最优解确实更省（或持平）", () => {
    const search = searchEncodings(counter, 24);
    const baseline = deriveSequential(counter).totalLiterals;
    expect(search.baseline).toBe(baseline);
    expect(search.best).toBeLessThanOrEqual(baseline);
    expect(search.optimal).toBe(baseline === search.best);
  });

  it("编码描述可读", () => {
    expect(describeEncoding(detector, [0, 2, 3, 1])).toBe("S0=00 · S1=10 · S2=11 · S3=01");
  });

  it("两状态只有两种编码", () => {
    const toggle: StateMachine = {
      stateCount: 2,
      inputName: "X",
      transitions: [
        [0, 1],
        [1, 0],
      ],
      outputs: [0, 1],
    };
    expect(searchEncodings(toggle).total).toBe(2);
  });
});

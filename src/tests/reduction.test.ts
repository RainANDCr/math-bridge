import { describe, expect, it } from "vitest";
import {
  deriveSequential,
  oneHotCodes,
  searchEncodings,
  stateBitsOf,
  stateCodesOf,
  verifyDerivation,
  type StateMachine,
} from "../core/sequential/machine";
import { compareBehavior, reduceMachine } from "../core/sequential/reduction";
import { compareDesigns, oneHotGroups, oneHotTerms } from "../core/sequential/comparison";

/** 两对完全重复的状态：S0≡S2，S1≡S3 */
const duplicated: StateMachine = {
  stateCount: 4,
  inputName: "X",
  transitions: [
    [1, 1],
    [0, 0],
    [1, 1],
    [0, 0],
  ],
  outputs: [0, 1, 0, 1],
};

/** 4 状态里 S1 与 S3 等价：都输出 0、都去 S2 */
const fourToOneThree: StateMachine = {
  stateCount: 4,
  inputName: "X",
  transitions: [
    [1, 1],
    [2, 2],
    [0, 0],
    [2, 2],
  ],
  outputs: [0, 0, 1, 0],
};

/** 连续两个 1 检测：S3 不可达，但与谁都不等价 —— 不能合并 */
const detector: StateMachine = {
  stateCount: 4,
  inputName: "X",
  transitions: [
    [0, 1],
    [0, 2],
    [0, 2],
    [0, 0],
  ],
  outputs: [0, 0, 1, 0],
};

describe("状态化简（划分细化）", () => {
  it("完全重复的状态对合并成 2 个状态，位宽从 2 位降到 1 位", () => {
    const reduction = reduceMachine(duplicated);
    expect(reduction.changed).toBe(true);
    expect(reduction.blocks).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(reduction.originalBits).toBe(2);
    expect(reduction.mergedBits).toBe(1);
    expect(reduction.mergedCount).toBe(2);
    // 合并后 S0' 仍是 S0 所在的等价类
    expect(reduction.merged.transitions).toEqual([
      [1, 1],
      [0, 0],
    ]);
    expect(reduction.merged.outputs).toEqual([0, 1]);
  });

  it("4 → 3 时位宽不变，但方程会变短", () => {
    const reduction = reduceMachine(fourToOneThree);
    expect(reduction.mergedCount).toBe(3);
    expect(reduction.originalBits).toBe(2);
    expect(reduction.mergedBits).toBe(2);
    expect(reduction.blocks).toEqual([[0], [1, 3], [2]]);
    const before = deriveSequential(fourToOneThree).totalLiterals;
    const after = deriveSequential(reduction.merged).totalLiterals;
    expect(after).toBeLessThanOrEqual(before);
  });

  it("不可达但可区分的状态不会被合并", () => {
    const reduction = reduceMachine(detector);
    expect(reduction.changed).toBe(false);
    expect(reduction.blocks).toEqual([[0], [1], [2], [3]]);
  });

  it("合并后的机器与原机器逐拍输出一致（穷举长度 ≤ 状态数）", () => {
    for (const machine of [duplicated, fourToOneThree]) {
      const reduction = reduceMachine(machine);
      expect(reduction.verified).toBe(true);
      expect(reduction.sequences).toBe(2 ** (machine.stateCount + 1) - 1);
      expect(compareBehavior(machine, reduction.merged, machine.stateCount).ok).toBe(true);
      // 合并后的转移表本身也必须是可推导的时序电路
      expect(verifyDerivation(reduction.merged, deriveSequential(reduction.merged))).toBe(true);
    }
  });

  it("每一步都给出分组与分裂依据，而不是只给最终答案", () => {
    const reduction = reduceMachine(detector);
    expect(reduction.rounds.length).toBeGreaterThan(1);
    expect(reduction.rounds[0].title).toContain("按输出分组");
    const text = reduction.rounds.map((round) => round.note).join("");
    expect(text).toContain("S3");
    expect(text).toContain("X=1");
  });

  it("Mealy 按输出二元组分组：Moore 输出相同但输入下输出不同，不能合并", () => {
    // 三个状态、转移完全相同；Moore 只看第一个输出，S1 与 S2 都是 0
    const moore: StateMachine = {
      stateCount: 3,
      inputName: "X",
      transitions: [
        [1, 1],
        [2, 2],
        [0, 0],
      ],
      outputs: [0, 0, 0],
    };
    const mealy: StateMachine = {
      ...moore,
      machineType: "mealy",
      outputs: [
        [0, 0],
        [0, 1],
        [1, 0],
      ],
    };

    // Moore：三个状态输出都为 0，输入行为也一致 → 合并成 1 个
    expect(reduceMachine(moore).mergedCount).toBe(1);
    // Mealy：S1 与 S2 在 X=0 时输出不同 → 不能合并
    const reducedMealy = reduceMachine(mealy);
    expect(reducedMealy.mergedCount).toBeGreaterThan(1);
    expect(reducedMealy.blocks).toContainEqual([1]);
    expect(reducedMealy.blocks).toContainEqual([2]);
    expect(compareBehavior(mealy, reducedMealy.merged, 3).ok).toBe(true);
  });

  it("全部等价时退化成 1 个状态：不需要触发器，输出是常量", () => {
    const reduction = reduceMachine({
      stateCount: 2,
      inputName: "X",
      transitions: [
        [0, 0],
        [0, 0],
      ],
      outputs: [1, 1],
    });
    expect(reduction.mergedCount).toBe(1);
    const design = deriveSequential(reduction.merged);
    expect(design.stateBits).toBe(0);
    expect(design.bits).toHaveLength(0);
    expect(design.output.result.expression).toBe("1");
    expect(verifyDerivation(reduction.merged, design)).toBe(true);
  });
});

describe("编码位宽由码字反推", () => {
  it("3 个状态：2 位编码，空出来的码是无关项", () => {
    const machine: StateMachine = {
      stateCount: 3,
      inputName: "X",
      transitions: [
        [1, 1],
        [2, 2],
        [0, 0],
      ],
      outputs: [0, 0, 1],
    };
    const design = deriveSequential(machine);
    expect(design.stateBits).toBe(2);
    expect(design.variables).toEqual(["Q1", "Q0", "X"]);
    // 4 个码字 × 2 个输入，最后两行（码 11）没有对应状态
    expect(design.bits[0].nextValues).toHaveLength(8);
    expect(design.bits[0].nextValues.slice(6)).toEqual(["X", "X"]);
    expect(design.output.values).toEqual([0, 0, 1, "X"]);
    expect(verifyDerivation(machine, design)).toBe(true);
  });

  it("二进制编码可以跳过某个码，代价可能与自然编码不同", () => {
    const machine: StateMachine = {
      stateCount: 3,
      inputName: "X",
      transitions: [
        [1, 1],
        [2, 2],
        [0, 0],
      ],
      outputs: [0, 0, 1],
    };
    expect(stateCodesOf({ ...machine, stateCodes: [0, 1, 3] })).toEqual([0, 1, 3]);
    // 4 已超出 2 位的码字空间
    expect(stateCodesOf({ ...machine, stateCodes: [0, 1, 4] })).toEqual([0, 1, 2]);
    const skipped = deriveSequential({ ...machine, stateCodes: [0, 1, 3] });
    expect(skipped.stateBits).toBe(2);
    expect(skipped.bits[0].nextValues[4]).toBe("X");
    expect(verifyDerivation({ ...machine, stateCodes: [0, 1, 3] }, skipped)).toBe(true);
  });

  it("3 个状态的编码分配：4 个码挑 3 个 = 24 种", () => {
    const machine: StateMachine = {
      stateCount: 3,
      inputName: "X",
      transitions: [
        [1, 1],
        [2, 2],
        [0, 0],
      ],
      outputs: [0, 0, 1],
    };
    expect(searchEncodings(machine).total).toBe(24);
  });

  it("1 个状态不需要状态位，常量方程也能通过回代校验", () => {
    const single: StateMachine = {
      stateCount: 1,
      inputName: "X",
      transitions: [[0, 0]],
      outputs: [1],
    };
    const design = deriveSequential(single);
    expect(design.stateBits).toBe(0);
    expect(design.equations).toHaveLength(1);
    expect(design.output.result.expression).toBe("1");
    expect(verifyDerivation(single, design)).toBe(true);
  });

  it("stateBitsOf 对非 2 的幂取上整", () => {
    expect(stateBitsOf(1)).toBe(0);
    expect(stateBitsOf(2)).toBe(1);
    expect(stateBitsOf(3)).toBe(2);
    expect(stateBitsOf(4)).toBe(2);
    expect(stateBitsOf(5)).toBe(3);
  });
});

describe("one-hot 编码", () => {
  const machine = fourToOneThree;

  it("每个状态一位，位宽等于状态数", () => {
    expect(oneHotCodes(4)).toEqual([8, 4, 2, 1]);
    const design = deriveSequential({ ...machine, encoding: "onehot" });
    expect(design.stateBits).toBe(4);
    expect(design.codes).toEqual([8, 4, 2, 1]);
    expect(design.equations).toHaveLength(5);
    expect(verifyDerivation({ ...machine, encoding: "onehot" }, design)).toBe(true);
  });

  it("每个 D_i 恰好是「进入该状态的所有转移」之和（在合法码字上逐行比对）", () => {
    const machine3 = { ...machine, stateCount: 3, transitions: [[1, 1], [2, 2], [0, 0]], outputs: [0, 0, 1] };
    const design = deriveSequential({ ...machine3, encoding: "onehot" });
    const groups = oneHotGroups(machine3);
    expect(groups).toHaveLength(3);

    for (let target = 0; target < 3; target += 1) {
      // bits[0] 是最高位 Q2；one-hot 下状态 target 占第 (n-1-target) 位
      const equation = design.bits[target].d!;
      for (let state = 0; state < 3; state += 1) {
        for (let input = 0; input <= 1; input += 1) {
          const codeRow = design.codes[state] * 2 + input;
          const expected = machine3.transitions[state][input] === target;
          const actual = equation.result.terms.some((term) =>
            term.cells.includes(codeRow)
          );
          // 直接读出的表达式与真值表逐行一致
          expect(actual).toBe(expected);
        }
      }
      // 转移条数 = 直接读出表达式里的乘积项条数
      expect(groups[target].terms.length).toBe(
        machine3.transitions.reduce(
          (acc, row) => acc + row.filter((next) => next === target).length,
          0
        )
      );
    }
  });

  it("one-hot 的每个乘积项只含源状态位与输入条件", () => {
    const terms = oneHotTerms(machine);
    // 4 状态 × 2 输入 = 8 条转移
    expect(terms).toHaveLength(8);
    for (const term of terms) {
      expect(term.text).toMatch(/^Q[0-3]·(¬X|X)$/);
    }
    // 进入 S2 的转移：S1 与 S3 在两个输入下都去 S2 → Q2·¬X + Q2·X + Q0·¬X + Q0·X
    const intoS2 = terms.filter((term) => term.target === 2);
    expect(intoS2.map((term) => term.text).sort()).toEqual([
      "Q0·X",
      "Q0·¬X",
      "Q2·X",
      "Q2·¬X",
    ]);
  });

  it("one-hot 与 JK / Mealy 组合也能逐行还原", () => {
    const mealy: StateMachine = {
      stateCount: 4,
      inputName: "X",
      machineType: "mealy",
      transitions: [
        [1, 1],
        [2, 2],
        [0, 0],
        [2, 2],
      ],
      outputs: [
        [0, 1],
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    };
    for (const machine of [fourToOneThree, mealy]) {
      for (const flipFlop of ["D", "JK"] as const) {
        const configured: StateMachine = { ...machine, encoding: "onehot", flipFlop };
        const design = deriveSequential(configured);
        expect(design.encoding).toBe("onehot");
        expect(verifyDerivation(configured, design)).toBe(true);
      }
    }
  });

  it("1 个状态时 one-hot 退化：0 位、没有 D 方程", () => {
    const single: StateMachine = {
      stateCount: 1,
      inputName: "X",
      transitions: [[0, 0]],
      outputs: [0],
    };
    const design = deriveSequential({ ...single, encoding: "onehot" });
    expect(design.stateBits).toBe(0);
    expect(oneHotGroups(single)).toEqual([]);
    expect(verifyDerivation({ ...single, encoding: "onehot" }, design)).toBe(true);
  });
});

describe("四种组合的代价对比", () => {
  it("化简 4 → 2 省下 1 个触发器；one-hot 用 2 个", () => {
    const reduction = reduceMachine(duplicated);
    const comparison = compareDesigns(duplicated, reduction);
    expect(comparison.bitSaving).toBe(1);
    const byKey = new Map(comparison.variants.map((variant) => [variant.key, variant]));
    expect(byKey.get("current-binary")!.flipFlops).toBe(2);
    expect(byKey.get("current-onehot")!.flipFlops).toBe(4);
    expect(byKey.get("reduced-binary")!.flipFlops).toBe(1);
    expect(byKey.get("reduced-onehot")!.flipFlops).toBe(2);
    expect(comparison.oneHotPremium).toBe(1);
  });

  it("one-hot 的触发器更多，但方程通常更浅", () => {
    const reduction = reduceMachine(fourToOneThree);
    const comparison = compareDesigns(fourToOneThree, reduction);
    const binary = comparison.variants.find((variant) => variant.key === "reduced-binary")!;
    const onehot = comparison.variants.find((variant) => variant.key === "reduced-onehot")!;
    expect(onehot.flipFlops).toBeGreaterThan(binary.flipFlops);
    expect(onehot.equations).toBe(binary.equations + 1);
  });

  it("应用化简后仍保留「化简前 → 化简后」的对照，高亮落在正在用的方案上", () => {
    const reduction = reduceMachine(duplicated);
    // 应用后：machine = 化简后的机器，live 也是它，但对照仍从化简前算起
    const comparison = compareDesigns(duplicated, reduction, reduction.merged);
    const current = comparison.variants.filter((variant) => variant.current);
    expect(current).toHaveLength(1);
    expect(current[0].key).toBe("reduced-binary");
    expect(current[0].stateCount).toBe(2);
    // 化简前的那一行还在，数字没有被冲掉
    expect(comparison.variants[0].stateCount).toBe(4);
    expect(comparison.variants[0].bits).toBe(2);
  });

  it("切到 one-hot 后高亮跟着换行", () => {
    const reduction = reduceMachine(duplicated);
    const onehot = { ...reduction.merged, encoding: "onehot" as const };
    const comparison = compareDesigns(duplicated, reduction, onehot);
    const current = comparison.variants.filter((variant) => variant.current);
    expect(current).toHaveLength(1);
    expect(current[0].key).toBe("reduced-onehot");
  });

  it("未发生化简时标记出重复行，避免误导", () => {
    const reduction = reduceMachine(detector);
    const comparison = compareDesigns(detector, reduction);
    expect(comparison.changed).toBe(false);
    const reducedRows = comparison.variants.filter((variant) => variant.duplicated);
    expect(reducedRows).toHaveLength(2);
  });
});

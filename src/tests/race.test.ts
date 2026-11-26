import { describe, expect, it } from "vitest";
import type { StateMachine } from "../core/sequential/machine";
import { analyzeRaces } from "../core/sequential/race";

/** S0(00) → S3(11) 两位同变；中间态 S1、S2 各自稳定 → 临界竞争 */
const critical: StateMachine = {
  stateCount: 4,
  inputName: "X",
  transitions: [
    [0, 3],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  outputs: [0, 0, 0, 0],
};

/** 同样两位同变，但中间态都收敛到 S3 → 非临界竞争 */
const harmless: StateMachine = {
  stateCount: 4,
  inputName: "X",
  transitions: [
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
  outputs: [0, 0, 0, 0],
};

/** 格雷码计数器：每一步只变一位，没有竞争 */
const grayCounter: StateMachine = {
  stateCount: 4,
  inputName: "X",
  transitions: [
    [1, 1],
    [3, 3],
    [0, 0],
    [2, 2],
  ],
  outputs: [0, 0, 0, 0],
};

describe("竞争分析", () => {
  it("临界竞争：不同到达顺序会停在不同的稳定状态", () => {
    const report = analyzeRaces(critical);
    expect(report.races).toHaveLength(1);
    const race = report.races[0];
    expect(race.state).toBe(0);
    expect(race.next).toBe(3);
    expect(race.changedBits).toEqual([0, 1]);
    expect(race.critical).toBe(true);
    expect(race.intermediates.sort()).toEqual([1, 2]);
    const results = race.outcomes.map((outcome) => outcome.next).sort();
    expect(results).toEqual([1, 2, 3]);
    expect(report.criticalCount).toBe(1);
  });

  it("非临界竞争：中间态最终都收敛到同一个状态", () => {
    const report = analyzeRaces(harmless);
    expect(report.races).toHaveLength(1);
    expect(report.races[0].critical).toBe(false);
    expect(report.races[0].outcomes.every((outcome) => outcome.next === 3)).toBe(true);
    expect(report.criticalCount).toBe(0);
  });

  it("只变一位的转移不算竞争", () => {
    const report = analyzeRaces(grayCounter);
    expect(report.races).toHaveLength(0);
    expect(report.checked).toBe(8);
  });

  it("中间态自己就是次态，也算另一种结果", () => {
    const sticky: StateMachine = {
      stateCount: 4,
      inputName: "X",
      transitions: [
        [0, 3],
        [1, 1],
        [2, 3],
        [3, 3],
      ],
      outputs: [0, 0, 0, 0],
    };
    const report = analyzeRaces(sticky);
    const race = report.races[0];
    // 若后采样时看到 01，次态仍是 S1 —— 不会走到目标 S3
    expect(race.critical).toBe(true);
    expect(race.outcomes.map((outcome) => outcome.next)).toContain(1);
  });

  it("中间码字不是合法状态时如实记录，不臆造结果", () => {
    // one-hot：两位同变，但中间码字（全 0 或两位为 1）都不是合法状态
    const machine: StateMachine = {
      stateCount: 4,
      inputName: "X",
      transitions: [
        [1, 1],
        [2, 2],
        [3, 3],
        [0, 0],
      ],
      outputs: [0, 0, 0, 0],
    };
    const report = analyzeRaces({ ...machine, encoding: "onehot" });
    expect(report.races.length).toBeGreaterThan(0);
    const race = report.races[0];
    expect(race.intermediates).toHaveLength(0);
    expect(race.invalidCodes.length).toBeGreaterThan(0);
    expect(race.critical).toBe(false);
  });

  it("码字不同，竞争结论也不同（同一个状态图）", () => {
    const natural = analyzeRaces(critical);
    // 把 S0 与 S1 的码字对调：S0=01、S1=00，S0→S3 仍是 01→11（一位）
    const swapped = analyzeRaces({ ...critical, stateCodes: [1, 0, 2, 3] });
    expect(natural.races).toHaveLength(1);
    expect(swapped.races).toHaveLength(0);
    expect(natural.criticalCount).toBeGreaterThan(swapped.criticalCount);
  });
});

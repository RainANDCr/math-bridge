import { describe, expect, it } from "vitest";
import type { StateMachine } from "../core/sequential/machine";
import { deriveSequential } from "../core/sequential/machine";
import { analyzeRaces } from "../core/sequential/race";
import { analyzeNetlist, evaluateNetlist } from "../core/circuit/netlist";
import {
  buildTimingModel,
  codeText,
  simulateEdge,
  sweepSkew,
  DEFAULT_CLOCK_TO_Q,
  DEFAULT_GATE_DELAY,
} from "../core/sequential/timing";

/** S0(00) → S3(11) 两位同变；中间态 S1、S2 各自稳定 → 状态层判为临界 */
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

/** 同样两位同变，但中间态都收敛到 S3 → 状态层判为非临界 */
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

const config = (skew: number, lateBit: number | null) => ({
  gateDelay: DEFAULT_GATE_DELAY,
  clockToQ: DEFAULT_CLOCK_TO_Q,
  skew,
  lateBit,
});

describe("门级延迟下的采样", () => {
  it("偏斜为 0 时每一位都采到沿前的值，与无偏斜的理想时序一致", () => {
    const design = deriveSequential(critical);
    const model = buildTimingModel(design);
    for (let state = 0; state < critical.stateCount; state += 1) {
      for (let input = 0; input <= 1; input += 1) {
        for (let bit = 0; bit < model.circuit.dffs.length; bit += 1) {
          const result = simulateEdge(model, state, input as 0 | 1, config(0, bit));
          expect(result.verdict).toBe("ok");
          expect(result.code).toBe(result.expectedCode);
        }
      }
    }
  });

  it("临界机器的阈值恰好是「时钟到输出 + 组合路径深度」", () => {
    const model = buildTimingModel(deriveSequential(critical));
    const thresholds = sweepSkew(model, 0, 1);
    const worst = Math.min(...thresholds.map((item) => item.failsAt ?? Infinity));
    expect(worst).toBe(DEFAULT_CLOCK_TO_Q + model.maxDepth * DEFAULT_GATE_DELAY);
  });

  it("超过阈值后采到的码，一定落在状态层枚举出的中间码里", () => {
    const machine = critical;
    const design = deriveSequential(machine);
    const model = buildTimingModel(design);
    const report = analyzeRaces(machine);
    const codes = design.codes;

    for (const race of report.races) {
      const allowed = new Set<number>([
        codes[race.state],
        codes[race.next],
        ...race.intermediates.map((state) => codes[state]),
      ]);
      for (let bit = 0; bit < model.circuit.dffs.length; bit += 1) {
        // 取一个远超阈值的偏斜：此时所有跳变都已稳定，采到的必须是某个中间码
        const result = simulateEdge(model, race.state, race.input as 0 | 1, config(6, bit));
        expect(result.code).not.toBeNull();
        expect(allowed.has(result.code!)).toBe(true);
      }
    }
  });

  it("状态层判为非临界时，门级层在任何偏斜下都不出错", () => {
    const machine = harmless;
    const model = buildTimingModel(deriveSequential(machine));
    const report = analyzeRaces(machine);
    expect(report.criticalCount).toBe(0);

    for (const race of report.races) {
      const thresholds = sweepSkew(model, race.state, race.input as 0 | 1);
      for (const item of thresholds) {
        expect(item.failsAt).toBeNull();
      }
    }
  });

  it("采样时刻正好落在跳变上时，值记为不确定而不是猜一个", () => {
    const model = buildTimingModel(deriveSequential(critical));
    const threshold = DEFAULT_CLOCK_TO_Q + model.maxDepth * DEFAULT_GATE_DELAY;
    const result = simulateEdge(model, 0, 1, config(threshold, 0));
    expect(result.verdict).toBe("changing");
    const bad = result.samples.filter((sample) => sample.verdict === "changing");
    expect(bad).toHaveLength(1);
    expect(bad[0].value).toBeNull();
    expect(bad[0].expected).toBe(1);
  });

  it("采到错值后，波形里这位触发器的 Q 也停在错值上，不会显示成正确的次态", () => {
    const model = buildTimingModel(deriveSequential(critical));
    const result = simulateEdge(model, 0, 1, config(4.5, 0));
    expect(result.verdict).toBe("wrong");
    expect(result.code).toBe(1);
    const q1 = result.traces.find((trace) => trace.label === "Q1");
    // 本该 0 → 1，实际采到 0，所以波形上不该有上升沿
    expect(q1?.edges).toHaveLength(1);
  });

  it("门延迟加倍，阈值同比推后（偏斜裕量与门的级数成正比）", () => {
    const model = buildTimingModel(deriveSequential(critical));
    const double = sweepSkew(model, 0, 1, { gateDelay: DEFAULT_GATE_DELAY * 2 });
    const worst = Math.min(...double.map((item) => item.failsAt ?? Infinity));
    expect(worst).toBe(DEFAULT_CLOCK_TO_Q + model.maxDepth * DEFAULT_GATE_DELAY * 2);
  });

  it("每条波形都有名字，D 端跟着对应触发器编号", () => {
    const model = buildTimingModel(deriveSequential(critical));
    const result = simulateEdge(model, 0, 1, config(1, 0));
    expect(result.traces.map((trace) => trace.label)).toEqual(["Q1", "Q0", "D1", "D0"]);
    expect(result.samples.every((sample) => sample.traceId !== null)).toBe(true);
  });
});

describe("门级延迟下的采样：one-hot", () => {
  it("one-hot 的裕量更小，且失败时落到全 0（不是另一个合法状态）", () => {
    const machine: StateMachine = { ...critical, encoding: "onehot" };
    const design = deriveSequential(machine);
    const model = buildTimingModel(design);
    expect(model.circuit.dffs).toHaveLength(4);

    const thresholds = sweepSkew(model, 0, 1);
    const failing = thresholds.filter((item) => item.failsAt !== null);
    expect(failing.length).toBeGreaterThan(0);

    // 最紧的那一位，采到的码是全 0，而它不在任何合法码字里
    const worst = failing.reduce((acc, item) => (item.failsAt! < acc.failsAt! ? item : acc));
    expect(worst.code).toBe(0);
    expect(codeText(worst.code, 4)).toBe("0000");
    expect(design.codes).not.toContain(0);
  });

  it("全 0 码在 one-hot 里是吸收态：所有 D 都为 0，进去就出不来", () => {
    const machine: StateMachine = { ...critical, encoding: "onehot" };
    const model = buildTimingModel(deriveSequential(machine));
    const zeros = new Map(model.circuit.dffs.map((ff) => [ff.id, 0 as const]));
    const assignment = new Map([["X", 1 as const]]);
    const { values } = evaluateNetlist(
      model.circuit.netlist,
      assignment,
      analyzeNetlist(model.circuit.netlist),
      zeros
    );
    // Q 全 0 时，每一位 D_i = 「迁入状态 i 的转移之和」，每一项都要求某个 Q 为 1
    for (const ff of model.circuit.dffs) {
      expect(ff.dSource).not.toBeNull();
      expect(values.get(ff.dSource!) ?? 0).toBe(0);
    }
  });
});

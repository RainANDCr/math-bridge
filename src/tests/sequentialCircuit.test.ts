import { describe, expect, it } from "vitest";
import {
  deriveSequential,
  nextStateOf,
  outputAt,
  type StateMachine,
} from "../core/sequential/machine";
import { buildSequentialCircuit } from "../core/circuit/sequentialCircuit";
import {
  analyzeNetlist,
  clockNetlist,
  evaluateNetlist,
  hasFlipFlop,
  netlistToText,
  type Bit,
} from "../core/circuit/netlist";

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

/** 把 DFF 的 Q 值按状态位顺序拼回编码 */
function codeOfState(circuit: ReturnType<typeof buildSequentialCircuit>, state: Map<string, Bit>): number {
  return circuit.dffs.reduce((acc, ff) => acc * 2 + (state.get(ff.id) ?? 0), 0);
}

function stateMapFor(
  circuit: ReturnType<typeof buildSequentialCircuit>,
  code: number
): Map<string, Bit> {
  const bits = circuit.dffs.length;
  const map = new Map<string, Bit>();
  circuit.dffs.forEach((ff, index) => {
    map.set(ff.id, ((code >> (bits - 1 - index)) & 1) as Bit);
  });
  return map;
}

describe("由方程生成时序电路", () => {
  it("生成的网表结构完整，触发器数等于状态位数", () => {
    const design = deriveSequential(counter);
    const circuit = buildSequentialCircuit(design);
    const analysis = analyzeNetlist(circuit.netlist);
    expect(analysis.ok).toBe(true);
    expect(analysis.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(circuit.dffs).toHaveLength(2);
    expect(hasFlipFlop(circuit.netlist)).toBe(true);
    // 两个触发器都要接到自己的 D 方程
    expect(circuit.dffs.every((ff) => ff.dSource !== null)).toBe(true);
  });

  it("每个状态、每个输入下，时钟沿后的次态与状态机一致", () => {
    for (const machine of [counter, detector]) {
      const design = deriveSequential(machine);
      const circuit = buildSequentialCircuit(design);
      const analysis = analyzeNetlist(circuit.netlist);

      for (let code = 0; code < machine.stateCount; code += 1) {
        for (let input = 0; input <= 1; input += 1) {
          const state = stateMapFor(circuit, code);
          const assignment = new Map<string, Bit>([[machine.inputName, input as Bit]]);

          const next = clockNetlist(circuit.netlist, assignment, state, analysis);
          expect(codeOfState(circuit, next)).toBe(nextStateOf(machine, code, input));

          // 输出在时钟沿之前就得对（Moore 只看当前状态）
          const { values } = evaluateNetlist(circuit.netlist, assignment, analysis, state);
          expect(values.get(circuit.outputId!) ?? 0).toBe(outputAt(machine, code, input));
        }
      }
    }
  });

  it("JK 形式的机器也能生成电路：先把次态算出来再接 D 触发器", () => {
    const machine: StateMachine = { ...counter, flipFlop: "JK" };
    const design = deriveSequential(machine);
    const circuit = buildSequentialCircuit(design);
    const analysis = analyzeNetlist(circuit.netlist);
    expect(analysis.ok).toBe(true);
    expect(circuit.dffs).toHaveLength(2);

    for (let code = 0; code < 4; code += 1) {
      const next = clockNetlist(
        circuit.netlist,
        new Map<string, Bit>([["X", 1]]),
        stateMapFor(circuit, code),
        analysis
      );
      expect(codeOfState(circuit, next)).toBe(nextStateOf(machine, code, 1));
    }
  });

  it("反馈经过触发器不算组合环", () => {
    const circuit = buildSequentialCircuit(deriveSequential(counter));
    const analysis = analyzeNetlist(circuit.netlist);
    expect(analysis.cycle).toBe(false);
  });

  it("导出的网表文本用 <= 表示时钟沿赋值", () => {
    const circuit = buildSequentialCircuit(deriveSequential(counter));
    const text = netlistToText(circuit.netlist);
    expect(text).toContain("<= ");
    expect(text).toContain("(时钟沿)");
    expect(text).toContain("Z =");
  });

  it("扇入超过 4 时串成树，而不是丢掉输入", () => {
    // 5 变量函数：最坏的一项有 5 个文字
    const machine: StateMachine = {
      stateCount: 2,
      inputName: "X",
      transitions: [
        [1, 1],
        [0, 0],
      ],
      outputs: [0, 1],
    };
    const design = deriveSequential(machine);
    const circuit = buildSequentialCircuit(design);
    const analysis = analyzeNetlist(circuit.netlist);
    expect(analysis.ok).toBe(true);
    for (const node of circuit.netlist.nodes) {
      if (node.kind === "AND" || node.kind === "OR") {
        expect(node.fanIn).toBeLessThanOrEqual(4);
      }
    }
    // 行为仍然正确
    for (let code = 0; code < 2; code += 1) {
      const next = clockNetlist(
        circuit.netlist,
        new Map<string, Bit>([["X", 1]]),
        stateMapFor(circuit, code),
        analysis
      );
      expect(codeOfState(circuit, next)).toBe(code === 1 ? 0 : 1);
    }
  });
});

import { describe, expect, it } from "vitest";
import { toExpressionString } from "../core/boolean/printer";
import {
  analyzeNetlist,
  evaluateNetlist,
  inputPortCount,
  makeNode,
  netlistExpression,
  netlistToText,
  netlistTruthTable,
  type Netlist,
} from "../core/circuit/netlist";

/** A·B + ¬C，手搭的经典小电路 */
function sample(): Netlist {
  return {
    nodes: [
      makeNode("a", "INPUT", 80, 120, "A"),
      makeNode("b", "INPUT", 80, 220, "B"),
      makeNode("c", "INPUT", 80, 320, "C"),
      makeNode("and1", "AND", 260, 160),
      makeNode("not1", "NOT", 260, 330),
      makeNode("or1", "OR", 440, 240),
      makeNode("out", "OUTPUT", 620, 240, "F"),
    ],
    wires: [
      { id: "w1", from: "a", to: "and1", toPort: 0 },
      { id: "w2", from: "b", to: "and1", toPort: 1 },
      { id: "w3", from: "c", to: "not1", toPort: 0 },
      { id: "w4", from: "and1", to: "or1", toPort: 0 },
      { id: "w5", from: "not1", to: "or1", toPort: 1 },
      { id: "w6", from: "or1", to: "out", toPort: 0 },
    ],
  };
}

describe("门级网表：分析", () => {
  it("完整电路通过检查", () => {
    const analysis = analyzeNetlist(sample());
    expect(analysis.ok).toBe(true);
    expect(analysis.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(analysis.variables).toEqual(["A", "B", "C"]);
    expect(analysis.outputs.map((o) => o.name)).toEqual(["F"]);
    expect(analysis.cycle).toBe(false);
  });

  it("悬空输入被报错", () => {
    const net = sample();
    net.wires = net.wires.filter((wire) => wire.id !== "w2");
    const analysis = analyzeNetlist(net);
    expect(analysis.ok).toBe(false);
    expect(analysis.issues.some((i) => i.message.includes("第 2 个输入"))).toBe(true);
  });

  it("重复变量名被报错", () => {
    const net = sample();
    net.nodes.push(makeNode("a2", "INPUT", 80, 420, "A"));
    net.nodes.push(makeNode("not2", "NOT", 260, 420));
    net.nodes.push(makeNode("or2", "OR", 440, 420));
    net.wires.push({ id: "x1", from: "a2", to: "not2", toPort: 0 });
    net.wires.push({ id: "x2", from: "not2", to: "or2", toPort: 0 });
    net.wires.push({ id: "x3", from: "a2", to: "or2", toPort: 1 });
    const analysis = analyzeNetlist(net);
    expect(analysis.ok).toBe(false);
    expect(analysis.issues.some((i) => i.message.includes("出现了两次"))).toBe(true);
  });

  it("同一端口接两根线被报错", () => {
    const net = sample();
    net.wires.push({ id: "w7", from: "c", to: "and1", toPort: 0 });
    const analysis = analyzeNetlist(net);
    expect(analysis.ok).toBe(false);
    expect(analysis.conflicts.size).toBe(1);
    expect(analysis.issues.some((i) => i.message.includes("不止一根线"))).toBe(true);
  });

  it("反馈环被识别", () => {
    const net: Netlist = {
      nodes: [
        makeNode("a", "INPUT", 80, 100, "A"),
        makeNode("n1", "AND", 260, 160),
        makeNode("n2", "OR", 440, 200),
        makeNode("out", "OUTPUT", 620, 200, "F"),
      ],
      wires: [
        { id: "w1", from: "a", to: "n1", toPort: 0 },
        { id: "w2", from: "n2", to: "n1", toPort: 1 },
        { id: "w3", from: "n1", to: "n2", toPort: 0 },
        { id: "w4", from: "a", to: "n2", toPort: 1 },
        { id: "w5", from: "n2", to: "out", toPort: 0 },
      ],
    };
    const analysis = analyzeNetlist(net);
    expect(analysis.cycle).toBe(true);
    expect(analysis.ok).toBe(false);
    expect(analysis.issues.some((i) => i.message.includes("反馈环"))).toBe(true);
  });

  it("没有输出节点被报错", () => {
    const net = sample();
    net.nodes = net.nodes.filter((node) => node.kind !== "OUTPUT");
    net.wires = net.wires.filter((wire) => wire.to !== "out");
    const analysis = analyzeNetlist(net);
    expect(analysis.ok).toBe(false);
    expect(analysis.issues.some((i) => i.message.includes("需要一个 F 端"))).toBe(true);
  });

  it("各门的端口数正确", () => {
    expect(inputPortCount(makeNode("x", "INPUT", 0, 0, "A"))).toBe(0);
    expect(inputPortCount(makeNode("x", "NOT", 0, 0))).toBe(1);
    expect(inputPortCount(makeNode("x", "OUTPUT", 0, 0, "F"))).toBe(1);
    expect(inputPortCount(makeNode("x", "AND", 0, 0, "", 3))).toBe(3);
    // 超过 4 个输入会被夹到 4，少于 2 会被抬到 2
    expect(inputPortCount(makeNode("x", "OR", 0, 0, "", 9))).toBe(4);
    expect(inputPortCount(makeNode("x", "XOR", 0, 0, "", 0))).toBe(2);
  });
});

describe("门级网表：求值与反推", () => {
  it("真值表与表达式一致", () => {
    const net = sample();
    const table = netlistTruthTable(net);
    expect(table.variables).toEqual(["A", "B", "C"]);
    // A·B + ¬C：只有 A=B=1 或 C=0 时为 1
    // 行序 ABC：000 001 010 011 100 101 110 111
    // C=0 的四行（0/2/4/6）必为 1；C=1 时只有 A=B=1（第 7 行）为 1
    const expected = [1, 0, 1, 0, 1, 0, 1, 1];
    expect(table.outputs[0].values).toEqual(expected);
  });

  it("求值与逐行代入一致", () => {
    const net = sample();
    const analysis = analyzeNetlist(net);
    for (let row = 0; row < 8; row += 1) {
      const assignment = new Map([
        ["A", ((row >> 2) & 1) as 0 | 1],
        ["B", ((row >> 1) & 1) as 0 | 1],
        ["C", (row & 1) as 0 | 1],
      ]);
      const { values, ok } = evaluateNetlist(net, assignment, analysis);
      expect(ok).toBe(true);
      const c = row & 1;
      const ab = (row >> 1) & 3;
      expect(values.get("out")).toBe(c === 0 || ab === 3 ? 1 : 0);
    }
  });

  it("反推表达式：A·B + ¬C", () => {
    const net = sample();
    const ast = netlistExpression(net, "out");
    expect(ast).not.toBeNull();
    const text = toExpressionString(ast!, { style: "ascii" });
    expect(text.replace(/\s/g, "")).toBe("A&B|!C");
  });

  it("多输入门按从左到右折叠", () => {
    const net: Netlist = {
      nodes: [
        makeNode("a", "INPUT", 60, 80, "A"),
        makeNode("b", "INPUT", 60, 160, "B"),
        makeNode("c", "INPUT", 60, 240, "C"),
        makeNode("and1", "AND", 240, 160, "", 3),
        makeNode("out", "OUTPUT", 420, 160, "F"),
      ],
      wires: [
        { id: "w1", from: "a", to: "and1", toPort: 0 },
        { id: "w2", from: "b", to: "and1", toPort: 1 },
        { id: "w3", from: "c", to: "and1", toPort: 2 },
        { id: "w4", from: "and1", to: "out", toPort: 0 },
      ],
    };
    const table = netlistTruthTable(net);
    expect(table.outputs[0].values).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    const text = toExpressionString(netlistExpression(net, "out")!, { style: "ascii" });
    expect(text.replace(/\s/g, "")).toBe("A&B&C");
  });

  it("XOR 与同或：奇偶校验", () => {
    const net: Netlist = {
      nodes: [
        makeNode("a", "INPUT", 60, 80, "A"),
        makeNode("b", "INPUT", 60, 160, "B"),
        makeNode("c", "INPUT", 60, 240, "C"),
        makeNode("x1", "XOR", 240, 120, "", 2),
        makeNode("x2", "XOR", 400, 180, "", 2),
        makeNode("out", "OUTPUT", 560, 180, "F"),
      ],
      wires: [
        { id: "w1", from: "a", to: "x1", toPort: 0 },
        { id: "w2", from: "b", to: "x1", toPort: 1 },
        { id: "w3", from: "x1", to: "x2", toPort: 0 },
        { id: "w4", from: "c", to: "x2", toPort: 1 },
        { id: "w5", from: "x2", to: "out", toPort: 0 },
      ],
    };
    const table = netlistTruthTable(net);
    // 三个变量的奇校验：1 的个数为奇数时为 1
    expect(table.outputs[0].values).toEqual([0, 1, 1, 0, 1, 0, 0, 1]);
  });

  it("不完整的电路不给假结果", () => {
    const net = sample();
    net.wires = net.wires.filter((wire) => wire.id !== "w5");
    const table = netlistTruthTable(net);
    expect(table.outputs[0].values.every((v) => v === 0)).toBe(true);
    expect(netlistExpression(net, "out")).toBeNull();
  });

  it("网表文本能描述连接关系", () => {
    const text = netlistToText(sample());
    expect(text).toContain("F = or1");
    expect(text).toContain("and1 = A·B");
    expect(text).toContain("not1 = ¬C");
  });
});

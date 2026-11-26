import type { BoolNode } from "../boolean/ast";

/**
 * 门级网表：手动搭建用的最小电路模型
 *
 * 与「表达式 → 电路」的自动生成不同，这里节点位置、连线都由用户决定。
 * 核心只做三件事：
 *   1. 结构与电气检查（重复变量名、悬空输入、多驱动、环路）
 *   2. 按拓扑序求值
 *   3. 反过来从连线推导出布尔表达式
 *
 * 第三步是重点：电路不是「照着表达式画出来的图」，它本身就是一个可求值的对象。
 * 把连线读回成表达式，才能验证「我搭的确实是我想要的」。
 */

export type GateKind = "INPUT" | "OUTPUT" | "AND" | "OR" | "NOT" | "XOR" | "CONST" | "DFF";

export interface GateNode {
  id: string;
  kind: GateKind;
  /** 中心坐标 */
  x: number;
  y: number;
  /** INPUT 为变量名，OUTPUT 为输出名，CONST 为 "0"/"1" */
  label: string;
  /** AND / OR / XOR 的输入个数 */
  fanIn: number;
}

export interface NetWire {
  id: string;
  /** 源节点（取其输出端） */
  from: string;
  /** 目标节点 */
  to: string;
  /** 目标节点的第几个输入端，从 0 开始 */
  toPort: number;
}

export interface Netlist {
  nodes: GateNode[];
  wires: NetWire[];
}

export const GATE_LABEL: Record<GateKind, string> = {
  INPUT: "输入",
  OUTPUT: "输出",
  AND: "与",
  OR: "或",
  NOT: "非",
  XOR: "异或",
  CONST: "常量",
  DFF: "D 触发器",
};

/** IEC 符号：比画 ANSI 形状更清楚，也不会有「这个弧形是不是画错了」的歧义 */
export const GATE_SYMBOL: Record<GateKind, string> = {
  INPUT: "",
  OUTPUT: "",
  AND: "&",
  OR: "≥1",
  NOT: "1",
  XOR: "=1",
  CONST: "",
  DFF: "FF",
};

export function inputPortCount(node: GateNode): number {
  switch (node.kind) {
    case "INPUT":
    case "CONST":
      return 0;
    case "OUTPUT":
    case "NOT":
    case "DFF":
      // DFF 只暴露 D 端；时钟是全局的，不单独占一个端口
      return 1;
    default:
      return Math.max(2, Math.min(4, node.fanIn));
  }
}

export function canDrive(node: GateNode): boolean {
  return node.kind !== "OUTPUT";
}

export interface NetlistIssue {
  severity: "error" | "warn";
  message: string;
  nodeId?: string;
}

export interface NetlistAnalysis {
  ok: boolean;
  issues: NetlistIssue[];
  /** 拓扑序；有环时只包含能排出的部分 */
  order: string[];
  cycle: boolean;
  variables: string[];
  outputs: Array<{ id: string; name: string }>;
  /** nodeId → 每个输入端口是否已接线 */
  connected: Map<string, boolean[]>;
  /** 被多根线驱动的端口，键为 `${nodeId}:${port}` */
  conflicts: Set<string>;
}

export function analyzeNetlist(netlist: Netlist): NetlistAnalysis {
  const issues: NetlistIssue[] = [];
  const byId = new Map(netlist.nodes.map((node) => [node.id, node]));
  const connected = new Map<string, boolean[]>();
  const driverAt = new Map<string, string>();
  const conflicts = new Set<string>();

  for (const node of netlist.nodes) {
    connected.set(node.id, new Array(inputPortCount(node)).fill(false));
  }

  for (const wire of netlist.wires) {
    const from = byId.get(wire.from);
    const to = byId.get(wire.to);
    if (!from || !to) {
      issues.push({ severity: "error", message: "有一条线连着不存在的元件" });
      continue;
    }
    if (!canDrive(from)) {
      issues.push({ severity: "error", message: `${from.label || from.id} 是输出端，不能再往外接`, nodeId: from.id });
      continue;
    }
    const ports = inputPortCount(to);
    if (wire.toPort < 0 || wire.toPort >= ports) {
      issues.push({ severity: "error", message: `${to.label || to.id} 没有第 ${wire.toPort + 1} 个输入端` });
      continue;
    }
    const key = `${wire.to}:${wire.toPort}`;
    if (driverAt.has(key)) {
      conflicts.add(key);
      issues.push({
        severity: "error",
        message: `${to.label || to.id} 的第 ${wire.toPort + 1} 个输入端接了不止一根线`,
        nodeId: to.id,
      });
      continue;
    }
    driverAt.set(key, wire.from);
    connected.get(to.id)![wire.toPort] = true;
  }

  // 悬空输入
  for (const node of netlist.nodes) {
    const ports = inputPortCount(node);
    const flags = connected.get(node.id)!;
    for (let port = 0; port < ports; port += 1) {
      if (!flags[port]) {
        const name = node.kind === "OUTPUT" ? node.label : GATE_LABEL[node.kind];
        issues.push({
          severity: "error",
          message:
            node.kind === "OUTPUT"
              ? `输出 ${node.label || node.id} 还没接线`
              : `${name} 门的第 ${port + 1} 个输入还没接线`,
          nodeId: node.id,
        });
      }
    }
  }

  // 变量与输出
  const inputNodes = netlist.nodes.filter((node) => node.kind === "INPUT");
  const seenVariables = new Map<string, string>();
  for (const node of inputNodes) {
    const name = node.label.trim().toUpperCase();
    if (!name) {
      issues.push({ severity: "error", message: "有一个输入节点没有写变量名", nodeId: node.id });
      continue;
    }
    if (name.length > 2) {
      issues.push({ severity: "warn", message: `变量名 ${name} 偏长，建议用单个字母`, nodeId: node.id });
    }
    if (seenVariables.has(name)) {
      issues.push({
        severity: "error",
        message: `变量 ${name} 出现了两次：同名输入必须是同一个信号`,
        nodeId: node.id,
      });
    } else {
      seenVariables.set(name, node.id);
    }
  }

  const outputNodes = netlist.nodes.filter((node) => node.kind === "OUTPUT");
  if (outputNodes.length === 0) {
    issues.push({ severity: "error", message: "还没有输出节点：电路需要一个 F 端" });
  }
  const seenOutputs = new Map<string, string>();
  for (const node of outputNodes) {
    const name = node.label.trim() || "F";
    if (seenOutputs.has(name)) {
      issues.push({ severity: "warn", message: `输出名 ${name} 重复了`, nodeId: node.id });
    }
    seenOutputs.set(name, node.id);
  }

  // 拓扑排序（Kahn）：只按真实存在的线建立依赖
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of netlist.nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const wire of netlist.wires) {
    if (!byId.has(wire.from) || !byId.has(wire.to)) continue;
    // 触发器是「状态源」：Q 由寄存器提供，不依赖同拍的 D ——
    // 否则反馈环会被误判成组合环
    if (byId.get(wire.to)!.kind === "DFF") continue;
    indegree.set(wire.to, (indegree.get(wire.to) ?? 0) + 1);
    outgoing.get(wire.from)!.push(wire.to);
  }
  const queue = netlist.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const value = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, value);
      if (value === 0) queue.push(next);
    }
  }
  const cycle = order.length !== netlist.nodes.length;
  if (cycle) {
    const stuck = netlist.nodes.filter((node) => !order.includes(node.id));
    issues.push({
      severity: "error",
      message: `有反馈环：${stuck
        .map((node) => node.label || GATE_LABEL[node.kind])
        .join("、")} 互相依赖。反馈必须经过触发器，组合逻辑本身不允许成环`,
    });
  }

  // 触发器也是状态变量：它的 Q 可以出现在表达式里
  const ffVariables = netlist.nodes
    .filter((node) => node.kind === "DFF")
    .map((node) => node.label.trim().toUpperCase())
    .filter(Boolean);
  const variables = [
    ...new Set([...inputNodes.map((node) => node.label.trim().toUpperCase()), ...ffVariables].filter(Boolean)),
  ].sort();
  const outputs = outputNodes.map((node) => ({ id: node.id, name: node.label || "F" }));
  const ok = issues.every((issue) => issue.severity !== "error");

  return { ok, issues, order, cycle, variables, outputs, connected, conflicts };
}

export type Bit = 0 | 1;

export function evaluateNetlist(
  netlist: Netlist,
  assignment: Map<string, Bit>,
  analysis?: NetlistAnalysis,
  /** 各触发器当前的 Q 值，键为节点 id */
  state?: Map<string, Bit>
): { values: Map<string, Bit>; ok: boolean } {
  const info = analysis ?? analyzeNetlist(netlist);
  const byId = new Map(netlist.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, Array<string | null>>();
  for (const node of netlist.nodes) {
    incoming.set(node.id, new Array(inputPortCount(node)).fill(null));
  }
  for (const wire of netlist.wires) {
    const ports = incoming.get(wire.to);
    if (ports && wire.toPort >= 0 && wire.toPort < ports.length && ports[wire.toPort] === null) {
      ports[wire.toPort] = wire.from;
    }
  }

  const values = new Map<string, Bit>();
  let ok = info.ok;
  for (const id of info.order) {
    const node = byId.get(id);
    if (!node) continue;
    const source = incoming.get(id) ?? [];
    const read = (port: number): Bit => {
      const from = source[port];
      if (!from) {
        ok = false;
        return 0;
      }
      return values.get(from) ?? 0;
    };

    let value: Bit = 0;
    switch (node.kind) {
      case "INPUT":
        value = assignment.get(node.label.trim().toUpperCase()) ?? 0;
        break;
      case "CONST":
        value = node.label.trim() === "1" ? 1 : 0;
        break;
      case "NOT":
        value = read(0) === 1 ? 0 : 1;
        break;
      case "OUTPUT":
        value = read(0);
        break;
      case "AND":
        value = source.every((_, port) => read(port) === 1) ? 1 : 0;
        break;
      case "OR":
        value = source.some((_, port) => read(port) === 1) ? 1 : 0;
        break;
      case "XOR": {
        let parity = 0;
        for (let port = 0; port < source.length; port += 1) parity ^= read(port);
        value = parity as Bit;
        break;
      }
      case "DFF":
        // Q 来自寄存器，不读 D —— 这是「次态在时钟沿才生效」的建模方式
        value = state?.get(id) ?? 0;
        break;
    }
    values.set(id, value);
  }

  return { values, ok: ok && !info.cycle };
}

/**
 * 来一个时钟沿：所有触发器同时采样 D 端，返回新的 Q 值。
 * 必须一起采样 —— 若边算边覆盖，后面的触发器会看到已经更新的前级。
 */
export function clockNetlist(
  netlist: Netlist,
  assignment: Map<string, Bit>,
  state: Map<string, Bit>,
  analysis?: NetlistAnalysis
): Map<string, Bit> {
  const info = analysis ?? analyzeNetlist(netlist);
  const { values } = evaluateNetlist(netlist, assignment, info, state);
  const next = new Map(state);
  for (const node of netlist.nodes) {
    if (node.kind !== "DFF") continue;
    const wire = netlist.wires.find((item) => item.to === node.id && item.toPort === 0);
    next.set(node.id, wire ? (values.get(wire.from) ?? 0) : 0);
  }
  return next;
}

export function hasFlipFlop(netlist: Netlist): boolean {
  return netlist.nodes.some((node) => node.kind === "DFF");
}

export interface NetlistTruthTable {
  variables: string[];
  outputs: Array<{ id: string; name: string; values: Bit[] }>;
}

export function netlistTruthTable(netlist: Netlist): NetlistTruthTable {
  const analysis = analyzeNetlist(netlist);
  const total = 1 << analysis.variables.length;
  const outputs = analysis.outputs.map((output) => ({
    id: output.id,
    name: output.name,
    values: new Array<Bit>(total).fill(0),
  }));

  if (!analysis.ok) return { variables: analysis.variables, outputs };

  for (let row = 0; row < total; row += 1) {
    const assignment = new Map<string, Bit>();
    analysis.variables.forEach((variable, bit) => {
      assignment.set(variable, ((row >> (analysis.variables.length - 1 - bit)) & 1) as Bit);
    });
    const state = new Map<string, Bit>();
    for (const node of netlist.nodes) {
      if (node.kind === "DFF") {
        state.set(node.id, assignment.get(node.label.trim().toUpperCase()) ?? 0);
      }
    }
    const { values } = evaluateNetlist(netlist, assignment, analysis, state);
    analysis.outputs.forEach((output, index) => {
      outputs[index].values[row] = values.get(output.id) ?? 0;
    });
  }

  return { variables: analysis.variables, outputs };
}

/** 从某个输出端反向推导表达式；结构不完整或成环时返回 null */
export function netlistExpression(
  netlist: Netlist,
  outputId: string,
  analysis?: NetlistAnalysis
): BoolNode | null {
  const info = analysis ?? analyzeNetlist(netlist);
  if (info.cycle) return null;

  const byId = new Map(netlist.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, Array<string | null>>();
  for (const node of netlist.nodes) {
    incoming.set(node.id, new Array(inputPortCount(node)).fill(null));
  }
  for (const wire of netlist.wires) {
    const ports = incoming.get(wire.to);
    if (ports && wire.toPort >= 0 && wire.toPort < ports.length && ports[wire.toPort] === null) {
      ports[wire.toPort] = wire.from;
    }
  }

  const memo = new Map<string, BoolNode | null>();
  const visiting = new Set<string>();

  const build = (id: string): BoolNode | null => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return null;
    visiting.add(id);
    const node = byId.get(id);
    if (!node) return null;

    let result: BoolNode | null;
    const kids = (incoming.get(id) ?? []).map((from) => (from ? build(from) : null));
    switch (node.kind) {
      case "INPUT":
        result = { kind: "var", name: node.label.trim().toUpperCase() };
        break;
      case "CONST":
        result = { kind: "const", value: node.label.trim() === "1" ? 1 : 0 };
        break;
      case "NOT":
        result = kids[0] ? { kind: "not", operand: kids[0]! } : null;
        break;
      case "OUTPUT":
        result = kids[0] ?? null;
        break;
      case "DFF":
        // Q 是状态变量，不是由 D 组合出来的
        result = { kind: "var", name: node.label.trim().toUpperCase() || "Q" };
        break;
      default: {
        // 任何一个输入没接，都算「还读不出表达式」——
        // 不能把悬空的端口悄悄丢掉，否则会得到一个看似完整的错误式子
        if (kids.length === 0 || kids.some((kid) => kid === null)) {
          result = null;
          break;
        }
        const kind = node.kind === "AND" ? "and" : node.kind === "OR" ? "or" : "xor";
        result = (kids as BoolNode[]).reduce(
          (left, right) => ({ kind, left, right }) as BoolNode
        );
        break;
      }
    }
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  return build(outputId);
}

/** 生成一个带位置的门节点 */
export function makeNode(
  id: string,
  kind: GateKind,
  x: number,
  y: number,
  label = "",
  fanIn = 2
): GateNode {
  return { id, kind, x, y, label, fanIn };
}

/** 导出成可读的网表文本（便于复制到作业里） */
export function netlistToText(netlist: Netlist): string {
  const byId = new Map(netlist.nodes.map((node) => [node.id, node]));
  const lines: string[] = [];
  for (const node of netlist.nodes) {
    if (node.kind === "INPUT" || node.kind === "CONST") continue;
    if (node.kind === "OUTPUT") {
      const wire = netlist.wires.find((item) => item.to === node.id && item.toPort === 0);
      lines.push(`${node.label} = ${wire ? describe(wire.from) : "?"}`);
      continue;
    }
    if (node.kind === "DFF") {
      const wire = netlist.wires.find((item) => item.to === node.id && item.toPort === 0);
      lines.push(`${node.label} <= ${wire ? describe(wire.from) : "?"}   (时钟沿)`);
      continue;
    }
    const ports = inputPortCount(node);
    const operands: string[] = [];
    for (let port = 0; port < ports; port += 1) {
      const wire = netlist.wires.find((item) => item.to === node.id && item.toPort === port);
      operands.push(wire ? describe(wire.from) : "?");
    }
    const symbol = node.kind === "AND" ? "·" : node.kind === "OR" ? " + " : " ⊕ ";
    const expr = node.kind === "NOT" ? `¬${operands[0]}` : operands.join(symbol);
    lines.push(`${node.id} = ${expr}`);
  }
  return lines.join("\n");

  function describe(id: string): string {
    const node = byId.get(id);
    if (!node) return "?";
    if (node.kind === "INPUT") return node.label.trim().toUpperCase();
    if (node.kind === "CONST") return node.label.trim() === "1" ? "1" : "0";
    if (node.kind === "OUTPUT") return node.label;
    return node.id;
  }
}

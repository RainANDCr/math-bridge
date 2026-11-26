import type { SequentialDerivation } from "../sequential/machine";
import type { Cube } from "../karnaugh/implicants";
import { makeNode, type GateNode, type Netlist, type NetWire } from "./netlist";

/**
 * 由时序方程生成门级网表
 *
 * 输入是 `deriveSequential` 的结果（D 触发器形式），输出是一张真正的网表：
 *   · 状态变量 Q0…Qk 由 DFF 的 Q 端提供（放在最左列，像状态寄存器）
 *   · 每个次态方程最小化后的与或式被连成 AND / OR 门
 *   · 触发器 D 端接对应方程的根，时钟是全局的
 *
 * 为什么用 D 触发器统一生成：JK 的激励方程是「怎么变」，D 的次态方程是「变成什么」。
 * 先把任意触发器方案都折算成次态，再接 DFF，电路的行为与原状态机逐拍一致 ——
 * JK 只是省门的一种编码，不是另一种语义。
 *
 * 扇入限制：网表的 AND / OR 最多 4 个输入，超过时自动串成树，
 * 不偷偷丢掉第 5 个输入。
 */

export interface SequentialCircuitInfo {
  netlist: Netlist;
  /** 每个触发器：D 端来自哪个节点 */
  dffs: Array<{ id: string; q: string; dSource: string | null }>;
  inputs: Array<{ id: string; name: string }>;
  outputId: string | null;
  gateCount: number;
  depth: number;
}

const MAX_FAN_IN = 4;

/** 各元件的绘制尺寸（渲染器共用，避免「算端口」和「画盒子」两套尺寸） */
export const NODE_SIZE: Record<string, { w: number; h: number }> = {
  INPUT: { w: 56, h: 32 },
  CONST: { w: 40, h: 28 },
  NOT: { w: 50, h: 34 },
  AND: { w: 70, h: 44 },
  OR: { w: 70, h: 44 },
  XOR: { w: 70, h: 44 },
  DFF: { w: 80, h: 58 },
  OUTPUT: { w: 56, h: 32 },
};

interface PendingNode {
  node: GateNode;
  lane: number;
  seq: number;
}

export function buildSequentialCircuit(design: SequentialDerivation): SequentialCircuitInfo {
  const nodes: PendingNode[] = [];
  const wires: NetWire[] = [];
  const usedIds = new Set<string>();
  let counter = 0;
  let lane = 0;
  let seq = 0;

  const uniqueId = (base: string): string => {
    let id = base;
    let suffix = 1;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `${base}-${suffix}`;
    }
    usedIds.add(id);
    return id;
  };

  const add = (kind: GateNode["kind"], label: string, fanIn = 2, atLane = 0): GateNode => {
    const node = makeNode(uniqueId(`${kind.toLowerCase()}-${counter++}`), kind, 0, 0, label, fanIn);
    nodes.push({ node, lane: atLane, seq: seq++ });
    return node;
  };

  const connect = (from: string, to: string, port = 0) => {
    wires.push({ id: uniqueId(`w-${counter++}`), from, to, toPort: port });
  };

  // —— 状态源：先把所有触发器建出来，Q 才能被任意方程引用 ——
  const qSource = new Map<string, string>();
  for (const bit of design.bits) {
    const node = add("DFF", bit.qVariable, 1, 0);
    qSource.set(bit.qVariable, node.id);
  }

  const inputSource = add("INPUT", design.variables[design.variables.length - 1] || "X", 0, 0);

  const notCache = new Map<string, string>();

  /** 取一个文字对应的信号源；取反文字复用同一个 NOT 门 */
  const sourceFor = (variable: string, negated: boolean): string => {
    let base: string;
    if (qSource.has(variable)) {
      base = qSource.get(variable)!;
    } else {
      base = inputSource.id;
    }
    if (!negated) return base;
    const key = variable;
    const cached = notCache.get(key);
    if (cached) return cached;
    const not = add("NOT", `¬${variable}`, 1, lane);
    connect(base, not.id, 0);
    notCache.set(key, not.id);
    return not.id;
  };

  /** 把一组信号合成一个门；超过扇入上限时串成树，不丢输入 */
  const combine = (kind: "AND" | "OR", sources: string[]): string => {
    if (sources.length === 0) return add("CONST", kind === "AND" ? "1" : "0", 0, lane).id;
    if (sources.length === 1) return sources[0];
    if (sources.length <= MAX_FAN_IN) {
      const gate = add(kind, "", sources.length, lane);
      sources.forEach((source, port) => connect(source, gate.id, port));
      return gate.id;
    }
    const chunked: string[] = [];
    for (let start = 0; start < sources.length; start += MAX_FAN_IN) {
      chunked.push(combine(kind, sources.slice(start, start + MAX_FAN_IN)));
    }
    return combine(kind, chunked);
  };

  const buildEquation = (terms: Cube[]): string => {
    if (terms.length === 0) return add("CONST", "0", 0, lane).id;
    const products = terms.map((term) => {
      if (term.literals.length === 0) return add("CONST", "1", 0, lane).id;
      const sources = term.literals.map((literal) => sourceFor(literal.variable, literal.negated));
      return combine("AND", sources);
    });
    return combine("OR", products);
  };

  // —— 每个次态方程 ——
  const dffs: SequentialCircuitInfo["dffs"] = [];
  for (const bit of design.bits) {
    const equation = bit.d ?? bit.j;
    if (!equation) continue;
    lane += 1;
    // D 型方程就是次态；没有 D 方程（JK 形式）时，用 D 设计的次态值反推项
    const root = buildEquation(bit.d ? bit.d.result.terms : termsFromValues(design, bit));
    const ffId = qSource.get(bit.qVariable)!;
    connect(root, ffId, 0);
    dffs.push({ id: ffId, q: bit.qVariable, dSource: root });
  }

  // —— 输出方程 ——
  lane += 1;
  // 0 变量（1 个状态）时最小化结果没有乘积项，但表达式是常量 1
  const outputRoot =
    design.output.result.terms.length === 0 && design.output.result.expression === "1"
      ? add("CONST", "1", 0, lane).id
      : buildEquation(design.output.result.terms);
  const output = add("OUTPUT", design.output.variable, 1, lane);
  connect(outputRoot, output.id, 0);

  // —— 布局：按「最长路径」分列，同列按创建顺序堆叠 ——
  const depthOf = new Map<string, number>();
  const byId = new Map(nodes.map((item) => [item.node.id, item]));
  const incoming = new Map<string, string[]>();
  for (const wire of wires) {
    const list = incoming.get(wire.to) ?? [];
    list.push(wire.from);
    incoming.set(wire.to, list);
  }

  const depth = (id: string, visiting = new Set<string>()): number => {
    if (depthOf.has(id)) return depthOf.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = byId.get(id)?.node;
    if (!node || node.kind === "INPUT" || node.kind === "CONST" || node.kind === "DFF") {
      depthOf.set(id, 0);
      return 0;
    }
    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => depth(parent, visiting))) + 1;
    depthOf.set(id, value);
    return value;
  };

  for (const item of nodes) depth(item.node.id);

  const columns = new Map<number, PendingNode[]>();
  for (const item of nodes) {
    const d = depthOf.get(item.node.id) ?? 0;
    const list = columns.get(d) ?? [];
    list.push(item);
    columns.set(d, list);
  }

  const columnGap = 132;
  const rowGap = 62;
  const marginX = 60;
  const marginY = 46;
  let tallest = 1;

  for (const [d, list] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    // 触发器与输入同在第 0 列：先放状态源，再放输入，读起来像「寄存器在前、输入在上」
    list.sort((a, b) => {
      const rank = (kind: string) => (kind === "DFF" ? 0 : kind === "INPUT" ? 1 : 2);
      return rank(a.node.kind) - rank(b.node.kind) || a.seq - b.seq;
    });
    tallest = Math.max(tallest, list.length);
    let cursor = marginY;
    list.forEach((item, index) => {
      item.node.x = marginX + d * columnGap;
      item.node.y = cursor;
      const size = NODE_SIZE[item.node.kind] ?? { w: 60, h: 40 };
      const next = list[index + 1];
      const nextSize = next ? NODE_SIZE[next.node.kind] ?? { w: 60, h: 40 } : null;
      // 触发器下面挂着时钟三角和 Q 名字，得单独多留一段，否则会被下一行的盒子压住；
      // 别的门没有这层负担，仍按紧凑行距排，免得整张图被撑高
      const labelRoom = item.node.kind === "DFF" ? 22 : 0;
      const step = nextSize ? size.h / 2 + labelRoom + nextSize.h / 2 + 14 : 0;
      cursor += Math.max(rowGap, step);
    });
  }

  const netlist: Netlist = {
    nodes: nodes.map((item) => item.node),
    wires,
  };

  return {
    netlist,
    dffs,
    inputs: [{ id: inputSource.id, name: inputSource.label }],
    outputId: output.id,
    gateCount: nodes.filter(
      (item) => item.node.kind === "AND" || item.node.kind === "OR" || item.node.kind === "NOT"
    ).length,
    depth: Math.max(0, ...[...depthOf.values()]),
  };
}

/**
 * JK 形式没有 D 方程。这里用次态取值直接构造乘积项（每个使 D=1 的行一项），
 * 保证生成的电路与状态机逐拍一致，而不是把 JK 的 J/K 错接成 D。
 */
function termsFromValues(design: SequentialDerivation, bit: SequentialDerivation["bits"][number]): Cube[] {
  const terms: Cube[] = [];
  const n = design.variables.length;
  bit.nextValues.forEach((value, row) => {
    if (value !== 1) return;
    const literals = design.variables.map((variable, position) => ({
      variable,
      negated: ((row >> (n - 1 - position)) & 1) === 0,
    }));
    terms.push({
      base: row,
      mask: (1 << n) - 1,
      cells: [row],
      literals,
      size: 1,
    });
  });
  return terms;
}

import type { Circuit, CircuitNode } from "./model";

/**
 * 电路自动排版
 *
 * 采用经典的「分层树布局」：
 *   1. 深度即列号（输入在最左，输出门在最右）
 *   2. 输入按出现顺序自上而下排开
 *   3. 每个门垂直居中于它的输入
 *   4. 每列做一次防重叠推挤
 *
 * 对于布尔表达式这种树结构，效果稳定且不需要引入图形库。
 */

export interface PlacedNode {
  node: CircuitNode;
  /** 中心坐标 */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Wire {
  from: string;
  to: string;
  d: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
}

export interface CircuitLayout {
  placed: PlacedNode[];
  byId: Map<string, PlacedNode>;
  wires: Wire[];
  width: number;
  height: number;
  maxDepth: number;
}

const PAD = 30;
const COL_GAP = 132;
const ROW_GAP = 52;
const GATE_W = 62;

export function gateHeight(node: CircuitNode): number {
  if (node.type === "INPUT" || node.type === "CONST") return 24;
  const arity = Math.max(1, node.inputs.length);
  if (node.type === "NOT") return 30;
  return 30 + Math.max(0, arity - 2) * 13;
}

export function inputPinOffsets(node: CircuitNode, h: number): number[] {
  const k = Math.max(1, node.inputs.length);
  if (k === 1) return [0];
  const span = node.type === "NOT" ? 0 : Math.min(h - 18, (k - 1) * 14);
  const step = span / (k - 1);
  return Array.from({ length: k }, (_, i) => -span / 2 + i * step);
}

export function layoutCircuit(circuit: Circuit): CircuitLayout {
  const map = new Map<string, CircuitNode>();
  circuit.nodes.forEach((n) => map.set(n.id, n));

  // —— 1. 叶子顺序 ——
  const leafOrder: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string): void => {
    const node = map.get(id);
    if (!node) return;
    if (node.type === "INPUT" || node.type === "CONST") {
      if (!seen.has(id)) {
        seen.add(id);
        leafOrder.push(id);
      }
      return;
    }
    node.inputs.forEach(walk);
  };
  walk(circuit.outputId);

  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const depths = new Map<number, string[]>();
  let deepest = 0;

  const placeLeaf = (id: string, slot: number): void => {
    const node = map.get(id);
    if (!node) return;
    const h = gateHeight(node);
    const w = node.type === "CONST" ? 34 : 46;
    pos.set(id, {
      x: PAD + w / 2,
      y: PAD + h / 2 + slot * ROW_GAP,
      w,
      h,
    });
  };

  leafOrder.forEach((id, i) => placeLeaf(id, i));

  for (const node of circuit.nodes) {
    deepest = Math.max(deepest, node.depth);
    if (node.type === "INPUT" || node.type === "CONST") continue;
    const h = gateHeight(node);
    const inputPositions = node.inputs.map((id) => pos.get(id)).filter(Boolean) as Array<{
      y: number;
    }>;
    const targetY =
      inputPositions.length > 0
        ? inputPositions.reduce((acc, p) => acc + p.y, 0) / inputPositions.length
        : PAD;
    pos.set(node.id, {
      x: PAD + node.depth * COL_GAP + GATE_W / 2,
      y: targetY,
      w: GATE_W,
      h,
    });
    const bucket = depths.get(node.depth) ?? [];
    bucket.push(node.id);
    depths.set(node.depth, bucket);
  }

  // —— 2. 每列防重叠 ——
  for (let d = 0; d <= deepest; d += 1) {
    const ids = depths.get(d) ?? [];
    if (ids.length < 2) continue;
    ids.sort((a, b) => (pos.get(a)?.y ?? 0) - (pos.get(b)?.y ?? 0));
    let cursor = -Infinity;
    for (const id of ids) {
      const p = pos.get(id);
      if (!p) continue;
      const minY = cursor === -Infinity ? PAD + p.h / 2 : cursor + 14 + p.h / 2;
      if (p.y < minY) p.y = minY;
      cursor = p.y + p.h / 2;
    }
  }

  const placed: PlacedNode[] = circuit.nodes.map((node) => {
    const p = pos.get(node.id) ?? { x: PAD, y: PAD, w: GATE_W, h: 30 };
    return { node, x: p.x, y: p.y, w: p.w, h: p.h };
  });

  // —— 3. 连线 ——
  const byId = new Map<string, PlacedNode>();
  placed.forEach((p) => byId.set(p.node.id, p));

  const wires: Wire[] = [];
  for (const p of placed) {
    if (p.node.inputs.length === 0) continue;
    const offsets = inputPinOffsets(p.node, p.h);
    p.node.inputs.forEach((inputId, i) => {
      const from = byId.get(inputId);
      if (!from) return;
      const fromPoint = { x: from.x + from.w / 2, y: from.y };
      const toPoint = { x: p.x - p.w / 2, y: p.y + (offsets[i] ?? 0) };
      const dx = Math.max(24, (toPoint.x - fromPoint.x) * 0.45);
      wires.push({
        from: from.node.id,
        to: p.node.id,
        d: `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x + dx} ${fromPoint.y}, ${
          toPoint.x - dx
        } ${toPoint.y}, ${toPoint.x} ${toPoint.y}`,
        fromPoint,
        toPoint,
      });
    });
  }

  const maxX = placed.reduce((acc, p) => Math.max(acc, p.x + p.w / 2), 0);
  const maxY = placed.reduce((acc, p) => Math.max(acc, p.y + p.h / 2), 0);

  return {
    placed,
    byId,
    wires,
    width: maxX + PAD,
    height: Math.max(maxY, 120) + PAD,
    maxDepth: deepest,
  };
}

export function pinAt(p: PlacedNode, index: number): { x: number; y: number } {
  const offsets = inputPinOffsets(p.node, p.h);
  return { x: p.x - p.w / 2, y: p.y + (offsets[index] ?? 0) };
}

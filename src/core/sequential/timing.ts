import {
  analyzeNetlist,
  evaluateNetlist,
  inputPortCount,
  type Bit,
  type GateNode,
  type NetlistAnalysis,
} from "../circuit/netlist";
import {
  buildSequentialCircuit,
  type SequentialCircuitInfo,
} from "../circuit/sequentialCircuit";
import type { SequentialDerivation } from "./machine";

/**
 * 门级延迟下的采样分析
 *
 * `race.ts` 回答的是「有没有可能进错状态」：它把「部分已更新的状态」当作一个**静态**假设，
 * 逐个算次态。但那个模型不知道时间 —— 它默认中间码会稳定地出现在采样时刻。
 *
 * 这里把门真的连起来、给每级一个延迟，然后问一个更具体的问题：
 * **偏斜到多少，后采样的触发器才会真的采到错值。**
 *
 * 模型（刻意做小，每条都写进界面）：
 *   · 每个门（与/或/非/异或）延迟 1 个时间单位，触发器时钟到输出 1 个单位；
 *   · 忽略布线延迟、忽略建立时间窗口；
 *   · 延迟小于一个门延迟的毛刺被吞掉（惯性延迟），不是所有瞬变都传下去；
 *   · 只有一位的时钟晚到，其余同时。整组一起偏斜是一阶效应，先不看。
 *
 * 时间用「半单位」的整数 tick 表示：门延迟 2 tick，偏斜步长 0.5 单位 = 1 tick。
 * 用整数是为了让「采样时刻正好在跳变」这种判断可以精确比较，不受浮点误差影响。
 */

export const TICKS_PER_UNIT = 2;

export const DEFAULT_GATE_DELAY = 1;
export const DEFAULT_CLOCK_TO_Q = 1;

export type SampleVerdict = "ok" | "wrong" | "changing";

export interface TimingConfig {
  /** 每个门的传播延迟（单位） */
  gateDelay: number;
  /** 触发器「时钟沿 → Q 变化」的延迟（单位） */
  clockToQ: number;
  /** 位间偏斜（单位） */
  skew: number;
  /** 晚采样的那一位（触发器下标）；null 表示全部同时到达 */
  lateBit: number | null;
}

export const DEFAULT_TIMING: TimingConfig = {
  gateDelay: DEFAULT_GATE_DELAY,
  clockToQ: DEFAULT_CLOCK_TO_Q,
  skew: 1,
  lateBit: 0,
};

export interface Edge {
  /** tick */
  t: number;
  value: Bit;
}

export interface SignalTrace {
  id: string;
  label: string;
  role: "Q" | "D";
  /** 按时间排序；第一条是 t=0 的初值 */
  edges: Edge[];
}

export interface SampleRecord {
  bit: number;
  label: string;
  /** 被采样的 D 信号在 traces 里的 id；波形上要在这里画采样点 */
  traceId: string | null;
  /** 采样时刻（tick） */
  at: number;
  /** 采样到的电平；null 表示采样瞬间信号正在跳变 */
  value: Bit | null;
  /** 稳定的情况下本该采到的值（沿前 D 的电平） */
  expected: Bit;
  verdict: SampleVerdict;
}

export interface TimingResult {
  traces: SignalTrace[];
  samples: SampleRecord[];
  /** 实际采到的码字；有「正在跳变」的位时为 null */
  code: number | null;
  /** 理想情况下（无偏斜）会采到的码字 */
  expectedCode: number;
  verdict: SampleVerdict;
  /** 波形右端（tick） */
  horizon: number;
}

export interface TimingModel {
  circuit: SequentialCircuitInfo;
  analysis: NetlistAnalysis;
  incoming: Map<string, Array<string | null>>;
  fanout: Map<string, string[]>;
  byId: Map<string, GateNode>;
  depth: Map<string, number>;
  /** 最深组合路径（以门为单位） */
  maxDepth: number;
  /** 状态序号 → 码字 */
  codes: number[];
  inputName: string;
}

const ticks = (units: number) => Math.round(units * TICKS_PER_UNIT);

/** 把网表的连线整理成「每个输入口接谁」和「谁被谁驱动」两张表 */
export function buildTimingModel(design: SequentialDerivation): TimingModel {
  const circuit = buildSequentialCircuit(design);
  const analysis = analyzeNetlist(circuit.netlist);
  const byId = new Map(circuit.netlist.nodes.map((node) => [node.id, node]));

  const incoming = new Map<string, Array<string | null>>();
  const fanout = new Map<string, string[]>();
  for (const node of circuit.netlist.nodes) {
    incoming.set(node.id, new Array(inputPortCount(node)).fill(null));
    fanout.set(node.id, []);
  }
  for (const wire of circuit.netlist.wires) {
    const ports = incoming.get(wire.to);
    if (ports && wire.toPort >= 0 && wire.toPort < ports.length && ports[wire.toPort] === null) {
      ports[wire.toPort] = wire.from;
    }
    const list = fanout.get(wire.from);
    if (list) list.push(wire.to);
  }

  const depth = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    const node = byId.get(id);
    if (!node || node.kind === "INPUT" || node.kind === "CONST" || node.kind === "DFF") {
      depth.set(id, 0);
      return 0;
    }
    const parents = (incoming.get(id) ?? []).filter((item): item is string => item !== null);
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((item) => visit(item, seen))) + 1;
    depth.set(id, value);
    return value;
  };
  let maxDepth = 0;
  for (const node of circuit.netlist.nodes) maxDepth = Math.max(maxDepth, visit(node.id, new Set()));

  return {
    circuit,
    analysis,
    incoming,
    fanout,
    byId,
    depth,
    maxDepth,
    codes: design.codes,
    inputName: circuit.inputs[0]?.name ?? "X",
  };
}

function gateValue(
  node: GateNode,
  incoming: Map<string, Array<string | null>>,
  current: Map<string, Bit>
): Bit {
  const ports = incoming.get(node.id) ?? [];
  const read = (port: number): Bit => {
    const from = ports[port];
    return from ? current.get(from) ?? 0 : 0;
  };
  switch (node.kind) {
    case "NOT":
      return read(0) === 1 ? 0 : 1;
    case "AND":
      return ports.every((_, port) => read(port) === 1) ? 1 : 0;
    case "OR":
      return ports.some((_, port) => read(port) === 1) ? 1 : 0;
    case "XOR": {
      let parity = 0;
      for (let port = 0; port < ports.length; port += 1) parity ^= read(port);
      return parity as Bit;
    }
    case "OUTPUT":
      return read(0);
    default:
      return current.get(node.id) ?? 0;
  }
}

function stateMapFor(model: TimingModel, stateIndex: number): Map<string, Bit> {
  const map = new Map<string, Bit>();
  const bits = model.circuit.dffs.length;
  const code = model.codes[stateIndex] ?? 0;
  model.circuit.dffs.forEach((ff, index) => {
    map.set(ff.id, ((code >> (bits - 1 - index)) & 1) as Bit);
  });
  return map;
}

function codeOf(samples: SampleRecord[], bits: number): number | null {
  let code = 0;
  for (let index = 0; index < bits; index += 1) {
    const value = samples[index]?.value;
    if (value === null || value === undefined) return null;
    code = (code << 1) | value;
  }
  return code;
}

function worst(samples: SampleRecord[]): SampleVerdict {
  if (samples.some((sample) => sample.verdict === "wrong")) return "wrong";
  if (samples.some((sample) => sample.verdict === "changing")) return "changing";
  return "ok";
}

/**
 * 跑一遍时钟沿。
 *
 * overrides 用于第二遍：第一遍按「沿前算出的正确次态」更新 Q，目的是看清 D 在采样时刻是什么；
 * 如果晚采样位其实采到了别的值，第二遍就用那个值当它的 Q 目标重跑，
 * 波形才不会显示成「它明明采错了却输出正确值」。
 *
 * 第二遍不会改变任何采样结论：所有采样都发生在不晚于 δ 的时刻，
 * 而被改动的 Q 跳变发生在 δ + 时钟到输出，因果上晚于采样。
 */
function runOnce(
  model: TimingModel,
  state: Map<string, Bit>,
  input: Bit,
  config: TimingConfig,
  overrides: Map<string, Bit>
): TimingResult {
  const { circuit, analysis, incoming, fanout, byId } = model;
  const assignment = new Map<string, Bit>([[model.inputName.toUpperCase(), input]]);
  const base = evaluateNetlist(circuit.netlist, assignment, analysis, state).values;

  const current = new Map<string, Bit>(base);
  const wave = new Map<string, Edge[]>();
  for (const node of circuit.netlist.nodes) {
    wave.set(node.id, [{ t: 0, value: current.get(node.id) ?? 0 }]);
  }

  const gateDelay = Math.max(1, ticks(config.gateDelay));
  const settle = Math.max(0, ticks(config.clockToQ));
  const arrivals = circuit.dffs.map((_, index) =>
    ticks(index === config.lateBit ? config.skew : 0)
  );

  interface Pending {
    t: number;
    id: string;
    value: Bit;
  }
  let pending: Pending[] = [];

  circuit.dffs.forEach((ff, index) => {
    const fallback = ff.dSource ? base.get(ff.dSource) ?? 0 : 0;
    const target = overrides.get(ff.id) ?? fallback;
    if (target !== (current.get(ff.id) ?? 0)) {
      pending.push({ t: arrivals[index] + settle, id: ff.id, value: target });
    }
  });

  const horizon = Math.max(...arrivals, 0) + settle + (model.maxDepth + 2) * gateDelay;

  let guard = 0;
  while (pending.length > 0 && guard < 4000) {
    guard += 1;
    const t = Math.min(...pending.map((event) => event.t));
    if (t > horizon) break;
    const batch = pending.filter((event) => event.t === t);
    pending = pending.filter((event) => event.t !== t);

    for (const event of batch) {
      if (current.get(event.id) === event.value) continue;
      current.set(event.id, event.value);
      wave.get(event.id)?.push({ t, value: event.value });
    }

    // 同一时刻到达的多条输入要一起看，否则会造出并不存在的毛刺
    const touched = new Set<string>();
    for (const event of batch) {
      for (const next of fanout.get(event.id) ?? []) touched.add(next);
    }
    for (const id of touched) {
      const node = byId.get(id);
      if (!node) continue;
      if (node.kind === "DFF" || node.kind === "INPUT" || node.kind === "CONST") continue;
      const value = gateValue(node, incoming, current);
      if (value === current.get(id)) continue;
      // 惯性延迟：这一级还没到时间的旧跳变被新值取代，短于门延迟的毛刺因此传不下去
      pending = pending.filter((event) => event.id !== id);
      pending.push({ t: t + gateDelay, id, value });
    }
  }

  const samples: SampleRecord[] = circuit.dffs.map((ff, index) => {
    const at = arrivals[index];
    const edges = ff.dSource ? wave.get(ff.dSource) ?? [] : [];
    // 第一条边是 t=0 的初值，不算跳变
    let value: Bit = edges[0]?.value ?? 0;
    let changing = false;
    for (let cursor = 1; cursor < edges.length; cursor += 1) {
      const edge = edges[cursor];
      if (edge.t === at) changing = true;
      if (edge.t <= at) value = edge.value;
      if (edge.t > at) break;
    }
    const expected = ff.dSource ? base.get(ff.dSource) ?? 0 : 0;
    const verdict: SampleVerdict = changing ? "changing" : value === expected ? "ok" : "wrong";
    return {
      bit: index,
      label: ff.q,
      traceId: ff.dSource,
      at,
      value: changing ? null : value,
      expected,
      verdict,
    };
  });

  const traces: SignalTrace[] = [];
  const claimed = new Set<string>();
  for (const ff of circuit.dffs) {
    traces.push({ id: ff.id, label: ff.q, role: "Q", edges: wave.get(ff.id) ?? [] });
    claimed.add(ff.id);
  }
  circuit.dffs.forEach((ff) => {
    if (!ff.dSource || claimed.has(ff.dSource)) return;
    claimed.add(ff.dSource);
    traces.push({
      id: ff.dSource,
      // 跟着触发器自己的名字走：Q1 的 D 端就叫 D1，不能按数组下标编
      label: `D${ff.q.replace(/^Q/, "")}`,
      role: "D",
      edges: wave.get(ff.dSource) ?? [],
    });
  });

  return {
    traces,
    samples,
    code: codeOf(samples, circuit.dffs.length),
    expectedCode: samples.reduce((acc, sample) => (acc << 1) | sample.expected, 0),
    verdict: worst(samples),
    horizon,
  };
}

/** 给定偏斜，跑一遍这个转移的时钟沿 */
export function simulateEdge(
  model: TimingModel,
  from: number,
  input: Bit,
  config: TimingConfig
): TimingResult {
  const state = stateMapFor(model, from);
  const first = runOnce(model, state, input, config, new Map());
  if (config.lateBit === null) return first;

  const record = first.samples[config.lateBit];
  if (!record || record.verdict !== "wrong" || record.value === null) return first;

  const ff = model.circuit.dffs[config.lateBit];
  if (!ff) return first;
  const second = runOnce(model, state, input, config, new Map([[ff.id, record.value]]));
  // 只换波形：采样结论用第一遍的（两遍必然一致，理由见 runOnce 注释）
  return { ...first, traces: second.traces };
}

export interface SkewPoint {
  skew: number;
  verdict: SampleVerdict;
  code: number | null;
}

export interface SkewThreshold {
  bit: number;
  label: string;
  /** 从多少单位开始采样不再正确；null = 扫描范围内都对 */
  failsAt: number | null;
  /** failsAt 处是否正好卡在跳变瞬间（亚稳态风险，而不是采到稳定的错值） */
  knife: boolean;
  /** 稳定采错时采到的码字 */
  code: number | null;
  series: SkewPoint[];
}

export interface SweepOptions {
  gateDelay?: number;
  clockToQ?: number;
  maxSkew?: number;
  step?: number;
}

/**
 * 逐位扫描偏斜，找每一位「从多少开始会采错」。
 *
 * 阈值不是凭经验给的：它就是「时钟到输出 + 该位 D 端到被改位的组合路径」——
 * 偏斜小于这个和时，采样发生在跳变传到 D 端之前，采到的仍是沿前的值。
 * 所以逻辑级数越浅（比如 one-hot 的 D_i 直接是若干转移之和），能容忍的偏斜越大。
 *
 * 扫描范围要越过阈值一点点，否则只会看到「正好卡在跳变」那一刻，
 * 看不到「稳定地采到错值」那一段 —— 后者才是真正会停在错误状态上的情形。
 */
export function sweepSkew(
  model: TimingModel,
  from: number,
  input: Bit,
  options: SweepOptions = {}
): SkewThreshold[] {
  const gateDelay = options.gateDelay ?? DEFAULT_GATE_DELAY;
  const clockToQ = options.clockToQ ?? DEFAULT_CLOCK_TO_Q;
  const maxSkew =
    options.maxSkew ??
    Math.min(8, Math.max(2, clockToQ + model.maxDepth * gateDelay + 1.5));
  const step = options.step ?? 0.5;
  const bits = model.circuit.dffs.length;

  const thresholds: SkewThreshold[] = [];
  for (let bit = 0; bit < bits; bit += 1) {
    const series: SkewPoint[] = [];
    let failsAt: number | null = null;
    let knife = false;
    let code: number | null = null;
    for (let raw = 0; raw <= maxSkew + 1e-9; raw += step) {
      const skew = Math.round(raw * 10) / 10;
      const result = simulateEdge(model, from, input, { gateDelay, clockToQ, skew, lateBit: bit });
      series.push({ skew, verdict: result.verdict, code: result.code });
      if (failsAt === null && result.verdict !== "ok") {
        failsAt = skew;
        knife = result.verdict === "changing";
      }
      if (code === null && result.verdict === "wrong") code = result.code;
    }
    thresholds.push({ bit, label: model.circuit.dffs[bit].q, failsAt, knife, code, series });
  }
  return thresholds;
}

/** 码字转成定长二进制串，UI 用 */
export function codeText(code: number | null, bits: number): string {
  if (code === null) return "—";
  return code.toString(2).padStart(bits, "0");
}

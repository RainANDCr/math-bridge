import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Eraser, Grid3x3, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge, Button, Callout, Panel, Segmented } from "../../components/common";
import { useApp } from "../../store/appStore";
import { toExpressionString } from "../../core/boolean/printer";
import type { NetWire } from "../../core/circuit/netlist";
import {
  GATE_LABEL,
  GATE_SYMBOL,
  analyzeNetlist,
  inputPortCount,
  makeNode,
  netlistExpression,
  netlistToText,
  netlistTruthTable,
  type GateKind,
  type GateNode,
  type Netlist,
} from "../../core/circuit/netlist";

/**
 * 门级手动搭建
 *
 * 画布本身不「知道」表达式：它只维护节点和连线。
 * 表达式是反过来从连线推导出来的 —— 这正是硬件描述的方向：
 * 先有电路，再有它实现的函数。
 */

const CANVAS_W = 900;
const CANVAS_H = 470;
const GATE_W = 68;
const GATE_H = 46;
const IO_W = 60;
const IO_H = 34;

function sizeOf(node: GateNode): { w: number; h: number } {
  if (node.kind === "INPUT" || node.kind === "OUTPUT" || node.kind === "CONST") {
    return { w: IO_W, h: IO_H };
  }
  return { w: GATE_W, h: GATE_H };
}

function inputPortPosition(node: GateNode, port: number) {
  const { w, h } = sizeOf(node);
  const count = inputPortCount(node);
  const step = h / (count + 1);
  return { x: node.x - w / 2, y: node.y - h / 2 + step * (port + 1) };
}

function outputPortPosition(node: GateNode) {
  const { w } = sizeOf(node);
  return { x: node.x + w / 2, y: node.y };
}

function wirePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(28, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

// —— 预设电路 ——

function presetAndOr(): Netlist {
  return {
    nodes: [
      makeNode("inA", "INPUT", 90, 110, "A"),
      makeNode("inB", "INPUT", 90, 200, "B"),
      makeNode("inC", "INPUT", 90, 320, "C"),
      makeNode("and1", "AND", 280, 155),
      makeNode("not1", "NOT", 280, 320),
      makeNode("or1", "OR", 470, 235),
      makeNode("outF", "OUTPUT", 660, 235, "F"),
    ],
    wires: [
      { id: "w1", from: "inA", to: "and1", toPort: 0 },
      { id: "w2", from: "inB", to: "and1", toPort: 1 },
      { id: "w3", from: "inC", to: "not1", toPort: 0 },
      { id: "w4", from: "and1", to: "or1", toPort: 0 },
      { id: "w5", from: "not1", to: "or1", toPort: 1 },
      { id: "w6", from: "or1", to: "outF", toPort: 0 },
    ],
  };
}

function presetMajority(): Netlist {
  return {
    nodes: [
      makeNode("inA", "INPUT", 80, 100, "A"),
      makeNode("inB", "INPUT", 80, 220, "B"),
      makeNode("inC", "INPUT", 80, 360, "C"),
      makeNode("and1", "AND", 260, 140),
      makeNode("and2", "AND", 260, 250),
      makeNode("and3", "AND", 260, 380),
      makeNode("or1", "OR", 450, 250, "", 3),
      makeNode("outF", "OUTPUT", 630, 250, "F"),
    ],
    wires: [
      { id: "w1", from: "inA", to: "and1", toPort: 0 },
      { id: "w2", from: "inB", to: "and1", toPort: 1 },
      { id: "w3", from: "inA", to: "and2", toPort: 0 },
      { id: "w4", from: "inC", to: "and2", toPort: 1 },
      { id: "w5", from: "inB", to: "and3", toPort: 0 },
      { id: "w6", from: "inC", to: "and3", toPort: 1 },
      { id: "w7", from: "and1", to: "or1", toPort: 0 },
      { id: "w8", from: "and2", to: "or1", toPort: 1 },
      { id: "w9", from: "and3", to: "or1", toPort: 2 },
      { id: "w10", from: "or1", to: "outF", toPort: 0 },
    ],
  };
}

function presetXor(): Netlist {
  return {
    nodes: [
      makeNode("inA", "INPUT", 110, 150, "A"),
      makeNode("inB", "INPUT", 110, 300, "B"),
      makeNode("xor1", "XOR", 330, 225),
      makeNode("outF", "OUTPUT", 560, 225, "F"),
    ],
    wires: [
      { id: "w1", from: "inA", to: "xor1", toPort: 0 },
      { id: "w2", from: "inB", to: "xor1", toPort: 1 },
      { id: "w3", from: "xor1", to: "outF", toPort: 0 },
    ],
  };
}

const PRESETS: Array<{ key: string; label: string; build: () => Netlist }> = [
  { key: "andor", label: "A·B + ¬C", build: presetAndOr },
  { key: "majority", label: "三人表决", build: presetMajority },
  { key: "xor", label: "异或", build: presetXor },
  { key: "blank", label: "空白", build: () => ({ nodes: [], wires: [] }) },
];

const GATE_KEY = "mathbridge.gate.v1";

function sanitizeNetlist(raw: unknown): Netlist | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { nodes?: unknown; wires?: unknown };
  if (!Array.isArray(record.nodes) || !Array.isArray(record.wires)) return null;
  const kinds = new Set<GateKind>(["INPUT", "OUTPUT", "AND", "OR", "NOT", "XOR", "CONST"]);

  const nodes: GateNode[] = [];
  for (const item of record.nodes.slice(0, 40)) {
    const node = item as Partial<GateNode>;
    if (typeof node.id !== "string" || !kinds.has(node.kind as GateKind)) return null;
    if (typeof node.x !== "number" || typeof node.y !== "number") return null;
    nodes.push({
      id: node.id,
      kind: node.kind as GateKind,
      x: Math.max(20, Math.min(CANVAS_W - 20, node.x)),
      y: Math.max(20, Math.min(CANVAS_H - 20, node.y)),
      label: typeof node.label === "string" ? node.label : "",
      fanIn: Number.isFinite(node.fanIn) ? Number(node.fanIn) : 2,
    });
  }
  const ids = new Set(nodes.map((node) => node.id));
  const wires: NetWire[] = [];
  for (const item of record.wires.slice(0, 120)) {
    const wire = item as Partial<NetWire>;
    if (typeof wire.id !== "string" || typeof wire.from !== "string" || typeof wire.to !== "string") {
      return null;
    }
    if (!ids.has(wire.from) || !ids.has(wire.to)) return null;
    wires.push({
      id: wire.id,
      from: wire.from,
      to: wire.to,
      toPort: Number.isInteger(wire.toPort) ? Number(wire.toPort) : 0,
    });
  }
  return { nodes, wires };
}

function loadNetlist(): Netlist {
  try {
    const raw = localStorage.getItem(GATE_KEY);
    if (!raw) return presetAndOr();
    return sanitizeNetlist(JSON.parse(raw)) ?? presetAndOr();
  } catch {
    return presetAndOr();
  }
}

function findFreeSpot(nodes: GateNode[]): { x: number; y: number } {
  for (let y = 90; y <= CANVAS_H - 60; y += 110) {
    for (let x = 120; x <= CANVAS_W - 80; x += 140) {
      const clash = nodes.some((node) => Math.abs(node.x - x) < 85 && Math.abs(node.y - y) < 60);
      if (!clash) return { x, y };
    }
  }
  return { x: 140 + ((nodes.length * 23) % 600), y: 90 + ((nodes.length * 37) % 380) };
}

export function GateLab() {
  const { state, actions } = useApp();
  const [netlist, setNetlist] = useState<Netlist>(loadNetlist);
  const [selected, setSelected] = useState<{ type: "node" | "wire"; id: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);

  // 手动搭的电路是一份劳动成果：切换工作台后还要在
  useEffect(() => {
    try {
      localStorage.setItem(GATE_KEY, JSON.stringify(netlist));
    } catch {
      /* 存储不可用时静默降级 */
    }
  }, [netlist]);

  const analysis = useMemo(() => analyzeNetlist(netlist), [netlist]);
  const table = useMemo(() => netlistTruthTable(netlist), [netlist]);
  const outputs = useMemo(
    () =>
      analysis.outputs.map((output) => {
        const ast = netlistExpression(netlist, output.id, analysis);
        return {
          ...output,
          expression: ast ? toExpressionString(ast, { style: "pretty" }) : null,
          ast,
        };
      }),
    [analysis, netlist]
  );

  // 与逻辑工作台的当前函数对比：变量集合一致、且电路只有一个输出时才逐行比对
  const comparison = useMemo(() => {
    const built = table.outputs[0]?.values;
    if (!built || table.outputs.length !== 1) return null;
    if (state.fn.variables.length !== table.variables.length) return null;
    if (state.fn.variables.some((variable, i) => variable !== table.variables[i])) return null;
    let checked = 0;
    let mismatched = 0;
    state.fn.values.forEach((value, row) => {
      if (value === "X") return;
      checked += 1;
      if ((value === 1 ? 1 : 0) !== built[row]) mismatched += 1;
    });
    return { checked, mismatched, name: "F" };
  }, [state.fn, table]);

  const errors = analysis.issues.filter((issue) => issue.severity === "error");
  const warnings = analysis.issues.filter((issue) => issue.severity === "warn");

  const toSvg = (event: React.PointerEvent | React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    return point.matrixTransform(matrix.inverse());
  };

  const nextId = (current: Netlist, prefix: string) => {
    let id = `${prefix}${idRef.current++}`;
    while (current.nodes.some((node) => node.id === id)) {
      id = `${prefix}${idRef.current++}`;
    }
    return id;
  };

  const nextInputName = (current: Netlist) => {
    const used = new Set(
      current.nodes.filter((node) => node.kind === "INPUT").map((node) => node.label.trim().toUpperCase())
    );
    for (const letter of "ABCDEFGH") {
      if (!used.has(letter)) return letter;
    }
    return "A";
  };

  const nextOutputName = (current: Netlist) => {
    const used = new Set(current.nodes.filter((node) => node.kind === "OUTPUT").map((node) => node.label));
    for (const name of ["F", "G", "H"]) {
      if (!used.has(name)) return name;
    }
    return "F";
  };

  const addNode = (kind: GateKind) => {
    setNetlist((current) => {
      const spot = findFreeSpot(current.nodes);
      const id = nextId(current, kind.toLowerCase());
      const label =
        kind === "INPUT"
          ? nextInputName(current)
          : kind === "OUTPUT"
          ? nextOutputName(current)
          : kind === "CONST"
          ? "1"
          : "";
      return {
        ...current,
        nodes: [...current.nodes, makeNode(id, kind, spot.x, spot.y, label, kind === "NOT" ? 1 : 2)],
      };
    });
  };

  const removeSelected = () => {
    if (!selected) return;
    setNetlist((current) =>
      selected.type === "node"
        ? {
            nodes: current.nodes.filter((node) => node.id !== selected.id),
            wires: current.wires.filter(
              (wire) => wire.from !== selected.id && wire.to !== selected.id
            ),
          }
        : { ...current, wires: current.wires.filter((wire) => wire.id !== selected.id) }
    );
    setSelected(null);
  };

  const connect = (from: string, to: string, toPort: number) => {
    setNetlist((current) => {
      const id = nextId(current, "w");
      // 一个输入端口只能接一根线：新线覆盖旧线，而不是制造「多驱动」错误
      const wires = current.wires.filter((wire) => !(wire.to === to && wire.toPort === toPort));
      return { ...current, wires: [...wires, { id, from, to, toPort }] };
    });
  };

  const updateNode = (id: string, patch: Partial<GateNode>) => {
    setNetlist((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      // 扇入变小时，超出范围的线要一起删掉，否则会留下「不存在的端口」
      wires:
        patch.fanIn === undefined
          ? current.wires
          : current.wires.filter(
              (wire) => wire.to !== id || wire.toPort < Math.max(2, Math.min(4, patch.fanIn!))
            ),
    }));
  };

  const selectedNode =
    selected?.type === "node" ? netlist.nodes.find((node) => node.id === selected.id) ?? null : null;

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>先搭电路，再问它实现了什么</h2>
            <p>
              拖节点、连端口。画布只记录<strong>谁连到谁</strong>，表达式是从连线反推出来的 ——
              这正是硬件的方向：电路先存在，函数是它的行为。搭完再和真值表对一遍。
            </p>
          </div>
          <div className="page-head__actions">
            <Badge tone={errors.length === 0 ? "ok" : "danger"}>
              {errors.length === 0 ? "检查通过" : `${errors.length} 个问题`}
            </Badge>
            <Badge tone="mute">{netlist.nodes.length} 个元件</Badge>
            <Badge tone="mute">{netlist.wires.length} 根线</Badge>
          </div>
        </div>

        <Panel
          title="画布"
          sub="点输出端 → 点输入端即可连线；拖动节点移动位置；选中后按 Delete 删除"
          actions={
            <div className="row wrap" style={{ gap: 4 }}>
              {(["INPUT", "AND", "OR", "NOT", "XOR", "OUTPUT"] as GateKind[]).map((kind) => (
                <Button key={kind} size="sm" variant="ghost" onClick={() => addNode(kind)}>
                  {kind === "INPUT" ? (
                    <span className="gate-add">
                      <Plus size={10} /> 输入
                    </span>
                  ) : kind === "OUTPUT" ? (
                    <span className="gate-add">
                      <Plus size={10} /> 输出
                    </span>
                  ) : (
                    <span className="gate-add">
                      <code>{GATE_SYMBOL[kind]}</code>
                      {GATE_LABEL[kind]}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          }
        >
          <div className="gate-toolbar">
            <div className="row wrap" style={{ gap: 4 }}>
              <span className="tiny dim">示例：</span>
              {PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNetlist(preset.build());
                    setSelected(null);
                    setPending(null);
                    setDrag(null);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="row" style={{ gap: 4 }}>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={12} />}
                disabled={!selected}
                onClick={removeSelected}
              >
                删除所选
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Eraser size={12} />}
                onClick={() => {
                  setNetlist({ nodes: [], wires: [] });
                  setSelected(null);
                  setPending(null);
                  setDrag(null);
                }}
              >
                清空
              </Button>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="gate-canvas"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                removeSelected();
              }
              if (event.key === "Escape") setPending(null);
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              role="application"
              aria-label="门级电路画布"
              onPointerMove={(event) => {
                const point = toSvg(event);
                if (drag) {
                  updateNode(drag.id, {
                    x: Math.max(40, Math.min(CANVAS_W - 40, point.x - drag.dx)),
                    y: Math.max(30, Math.min(CANVAS_H - 30, point.y - drag.dy)),
                  });
                }
                if (pending) setCursor(point);
              }}
              onPointerUp={() => setDrag(null)}
              onPointerLeave={() => setDrag(null)}
            >
              <defs>
                <pattern id="gate-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                  <path d="M 22 0 L 0 0 0 22" fill="none" stroke="var(--line-soft)" strokeWidth="0.6" />
                </pattern>
                <marker
                  id="gate-arrow"
                  viewBox="0 0 8 8"
                  refX="6"
                  refY="4"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--text-mute)" />
                </marker>
              </defs>
              <rect
                x={0}
                y={0}
                width={CANVAS_W}
                height={CANVAS_H}
                fill="url(#gate-grid)"
                onClick={() => {
                  setSelected(null);
                  setPending(null);
                }}
              />

              {/* 连线 */}
              {netlist.wires.map((wire) => {
                const from = netlist.nodes.find((node) => node.id === wire.from);
                const to = netlist.nodes.find((node) => node.id === wire.to);
                if (!from || !to) return null;
                const start = outputPortPosition(from);
                const end = inputPortPosition(to, wire.toPort);
                const d = wirePath(start, end);
                const active = selected?.type === "wire" && selected.id === wire.id;
                return (
                  <g key={wire.id} className="gate-wire-group">
                    <path
                      d={d}
                      className="gate-wire__hit"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected({ type: "wire", id: wire.id });
                      }}
                    />
                    <path
                      d={d}
                      className={`gate-wire${active ? " is-selected" : ""}`}
                      markerEnd="url(#gate-arrow)"
                    />
                  </g>
                );
              })}

              {/* 待连接预览 */}
              {pending &&
                cursor &&
                (() => {
                  const from = netlist.nodes.find((node) => node.id === pending);
                  if (!from) return null;
                  return (
                    <path
                      className="gate-wire is-pending"
                      d={wirePath(outputPortPosition(from), cursor)}
                      pointerEvents="none"
                    />
                  );
                })()}

              {/* 节点 */}
              {netlist.nodes.map((node) => {
                const { w, h } = sizeOf(node);
                const active = selected?.type === "node" && selected.id === node.id;
                const connected = analysis.connected.get(node.id) ?? [];
                return (
                  <g
                    key={node.id}
                    className={`gate-node${active ? " is-selected" : ""}`}
                    transform={`translate(${node.x} ${node.y})`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      canvasRef.current?.focus();
                      setSelected({ type: "node", id: node.id });
                      const point = toSvg(event);
                      setDrag({ id: node.id, dx: point.x - node.x, dy: point.y - node.y });
                      svgRef.current?.setPointerCapture(event.pointerId);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <rect
                      x={-w / 2}
                      y={-h / 2}
                      width={w}
                      height={h}
                      rx={node.kind === "INPUT" || node.kind === "OUTPUT" ? 16 : 7}
                      className="gate-node__body"
                    />
                    {node.kind === "INPUT" || node.kind === "OUTPUT" || node.kind === "CONST" ? (
                      <text className="gate-node__io" textAnchor="middle" y={5}>
                        {node.label}
                      </text>
                    ) : (
                      <>
                        <text className="gate-node__symbol" textAnchor="middle" y={6}>
                          {GATE_SYMBOL[node.kind]}
                        </text>
                        <text className="gate-node__kind" textAnchor="middle" y={h / 2 + 12}>
                          {GATE_LABEL[node.kind]}
                        </text>
                      </>
                    )}

                    {/* 输入端口 */}
                    {Array.from({ length: inputPortCount(node) }, (_, port) => {
                      const position = inputPortPosition(node, port);
                      return (
                        <g key={port}>
                          <circle
                            cx={position.x - node.x}
                            cy={position.y - node.y}
                            r={5}
                            className={`gate-port gate-port--in${
                              connected[port] ? " is-wired" : ""
                            }${pending ? " is-target" : ""}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`输入端 ${node.label || node.id} 第 ${port + 1} 个`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              if (!pending) return;
                              if (pending === node.id) return;
                              connect(pending, node.id, port);
                              setPending(null);
                              setCursor(null);
                            }}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <title>
                            {node.label || node.id} 的第 {port + 1} 个输入
                          </title>
                        </g>
                      );
                    })}

                    {/* 输出端口 */}
                    {node.kind !== "OUTPUT" && (
                      <circle
                        cx={w / 2}
                        cy={0}
                        r={5.5}
                        className={`gate-port gate-port--out${pending === node.id ? " is-active" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`输出端 ${node.label || node.id}`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelected({ type: "node", id: node.id });
                          if (pending === node.id) {
                            setPending(null);
                            setCursor(null);
                          } else {
                            setPending(node.id);
                            setCursor(outputPortPosition(node));
                          }
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="gate-hint">
            {pending
              ? "已选中一个输出端：现在点任意输入端完成连线（Esc 取消）"
              : errors.length > 0
              ? `还有 ${errors.length} 处没接好：${errors[0].message}`
              : "电路完整：分析面板里可以读出它实现的表达式与真值表"}
          </div>
        </Panel>

        {selectedNode && selectedNode.kind !== "INPUT" && selectedNode.kind !== "OUTPUT" && selectedNode.kind !== "CONST" && (
          <Panel title={`${GATE_LABEL[selectedNode.kind]}门设置`} sub={selectedNode.id}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="field__label">
                {selectedNode.kind === "NOT" ? "非门固定 1 个输入" : "输入个数"}
              </div>
              <Segmented
                block
                value={String(Math.max(2, Math.min(4, selectedNode.fanIn)))}
                onChange={(value) => updateNode(selectedNode.id, { fanIn: Number(value) })}
                label="输入个数"
                options={
                  selectedNode.kind === "NOT"
                    ? [{ value: "2", label: "1" }]
                    : [
                        { value: "2", label: "2" },
                        { value: "3", label: "3" },
                        { value: "4", label: "4" },
                      ]
                }
              />
              <div className="tiny dim">改动会删掉超出新端口数的连线，避免留下悬空的线。</div>
            </div>
          </Panel>
        )}
      </main>

      <aside className="inspector" aria-label="电路分析">
        <Panel
          title="反推表达式"
          actions={<Wand2 size={14} style={{ color: "var(--text-mute)" }} />}
        >
          {outputs.length === 0 ? (
            <div className="tiny dim">还没有输出节点。加一个「输出」并接到最后一个门上。</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {outputs.map((output) => (
                <div key={output.id}>
                  <div className="row-between">
                    <span className="field__label">{output.name}</span>
                    {output.ast && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ArrowLeftRight size={11} />}
                        onClick={() => {
                          if (!output.expression) return;
                          const result = actions.applyExpression(`${output.name} = ${output.expression}`);
                          if (result.ok) actions.setStudio("logic");
                        }}
                      >
                        送到逻辑工作台
                      </Button>
                    )}
                  </div>
                  <div className="formula" style={{ marginTop: 3 }}>
                    {output.name} = {output.expression ?? "—（输入还没接完）"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="电路检查"
          actions={
            <Badge tone={errors.length === 0 ? "ok" : "danger"}>
              {errors.length === 0 ? "通过" : `${errors.length} 错`}
            </Badge>
          }
        >
          {analysis.issues.length === 0 ? (
            <div className="tiny dim">结构完整：没有悬空输入、没有多驱动、没有环路。</div>
          ) : (
            <div className="stack" style={{ gap: 5 }}>
              {analysis.issues.slice(0, 8).map((issue, index) => (
                <div key={index} className={`gate-issue is-${issue.severity}`}>
                  <span className="gate-issue__dot" />
                  {issue.message}
                </div>
              ))}
              {analysis.issues.length > 8 && (
                <div className="tiny dim">还有 {analysis.issues.length - 8} 条…</div>
              )}
            </div>
          )}
          {warnings.length > 0 && errors.length === 0 && (
            <Callout tone="warn">有 {warnings.length} 条提醒，但电路仍可求值。</Callout>
          )}
        </Panel>

        <Panel
          title="真值表"
          sub={table.variables.length > 0 ? table.variables.join(" ") : "还没有输入"}
          actions={<Grid3x3 size={14} style={{ color: "var(--text-mute)" }} />}
        >
          {table.variables.length === 0 || table.outputs.length === 0 ? (
            <div className="tiny dim">需要至少一个输入和一个输出。</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 260 }}>
              <table className="gate-table">
                <thead>
                  <tr>
                    {table.variables.map((variable) => (
                      <th key={variable}>{variable}</th>
                    ))}
                    {table.outputs.map((output) => (
                      <th key={output.id} className="is-output">
                        {output.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.outputs[0].values.map((_, row) => (
                    <tr
                      key={row}
                      className={
                        table.outputs.every((output) => output.values[row] === 1) ? "is-one" : undefined
                      }
                    >
                      {table.variables.map((variable, bit) => (
                        <td key={variable}>
                          {(row >> (table.variables.length - 1 - bit)) & 1}
                        </td>
                      ))}
                      {table.outputs.map((output) => (
                        <td key={output.id} className={output.values[row] === 1 ? "is-high" : "is-low"}>
                          {output.values[row]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="与当前函数对比"
          actions={
            comparison ? (
              <Badge tone={comparison.mismatched === 0 ? "ok" : "warn"}>
                {comparison.mismatched === 0 ? "完全一致" : `${comparison.mismatched} 行不同`}
              </Badge>
            ) : (
              <Badge tone="mute">无法比对</Badge>
            )
          }
        >
          {comparison ? (
            <div className="tiny muted" style={{ lineHeight: 1.7 }}>
              逻辑工作台的当前函数 F 与这个电路变量相同（{table.variables.join("、")}），
              逐行比对 {comparison.checked} 行，
              {comparison.mismatched === 0
                ? "输出完全一致 —— 说明这套连线确实实现了 F。"
                : `有 ${comparison.mismatched} 行不一致，电路还没接成 F。`}
            </div>
          ) : (
            <div className="tiny dim" style={{ lineHeight: 1.7 }}>
              需要电路只有一个输出、且输入变量与当前函数完全相同（当前函数：
              {state.fn.variables.length > 0 ? state.fn.variables.join("、") : "常量"}
              ；电路：{table.variables.length > 0 ? table.variables.join("、") : "无输入"}）。
              在逻辑工作台改一下变量，再回来对比。
            </div>
          )}
        </Panel>

        <Panel title="网表文本" sub="复制到作业里">
          <pre className="gate-netlist">{netlistToText(netlist) || "（空）"}</pre>
        </Panel>

        <Panel title="和表达式模式的区别">
          <div className="tiny muted" style={{ lineHeight: 1.7 }}>
            逻辑工作台是「先写式子，再画电路」；这里是「先连电路，再读式子」。
            两边都能得到真值表，但只有这边会遇到
            <strong>环路、悬空输入、多驱动</strong>这些真实的工程问题。
            <br />
            提示：选中一个与门可以改输入个数（2–4）；一个输入端口只能接一根线。
          </div>
        </Panel>
      </aside>
    </>
  );
}

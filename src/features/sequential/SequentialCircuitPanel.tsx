import { useEffect, useMemo, useState } from "react";
import { Clock, Copy, Cpu, RotateCcw } from "lucide-react";
import { Badge, Button, Panel, Stat } from "../../components/common";
import {
  analyzeNetlist,
  clockNetlist,
  evaluateNetlist,
  inputPortCount,
  netlistToText,
  type Bit,
  type GateNode,
} from "../../core/circuit/netlist";
import {
  buildSequentialCircuit,
  NODE_SIZE,
} from "../../core/circuit/sequentialCircuit";
import type { SequentialDerivation } from "../../core/sequential/machine";

/**
 * 时序电路（由方程生成）
 *
 * 把最小化后的每个次态方程连成门，D 触发器从 Q 端把状态送回左侧。
 * 时钟按钮真的按「同时采样所有 D」更新一次状态 —— 不是逐位算完就覆盖，
 * 否则后面的触发器会看到已经变化的前级。
 */
export function SequentialCircuitPanel({
  design,
  inputName,
}: {
  design: SequentialDerivation;
  inputName: string;
}) {
  const circuit = useMemo(() => buildSequentialCircuit(design), [design]);
  const analysis = useMemo(() => analyzeNetlist(circuit.netlist), [circuit]);
  const [input, setInput] = useState<Bit>(0);
  const [state, setState] = useState<Map<string, Bit>>(new Map());
  const [steps, setSteps] = useState(0);
  const [copied, setCopied] = useState(false);

  const initialState = useMemo(() => {
    const map = new Map<string, Bit>();
    const bits = circuit.dffs.length;
    const code = design.codes[0] ?? 0;
    circuit.dffs.forEach((ff, index) => {
      map.set(ff.id, ((code >> (bits - 1 - index)) & 1) as Bit);
    });
    return map;
  }, [circuit, design.codes]);

  useEffect(() => {
    setState(initialState);
    setSteps(0);
  }, [initialState]);

  const assignment = useMemo(
    () => new Map<string, Bit>([[inputName, input]]),
    [inputName, input]
  );
  const { values } = useMemo(
    () => evaluateNetlist(circuit.netlist, assignment, analysis, state),
    [circuit, assignment, analysis, state]
  );

  const clock = () => {
    setState((current) => clockNetlist(circuit.netlist, assignment, current, analysis));
    setSteps((count) => count + 1);
  };

  const reset = () => {
    setState(initialState);
    setSteps(0);
  };

  const bounds = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const node of circuit.netlist.nodes) {
      const size = NODE_SIZE[node.kind] ?? { w: 60, h: 40 };
      maxX = Math.max(maxX, node.x + size.w / 2);
      maxY = Math.max(maxY, node.y + size.h / 2);
    }
    return { width: maxX + 40, height: maxY + 40 };
  }, [circuit]);

  const stateCode = circuit.dffs.reduce((acc, ff) => acc * 2 + (state.get(ff.id) ?? 0), 0);
  const outputValue = circuit.outputId ? values.get(circuit.outputId) ?? 0 : 0;

  const copyNetlist = async () => {
    try {
      await navigator.clipboard.writeText(netlistToText(circuit.netlist));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板被拒绝时静默失败 */
    }
  };

  return (
    <Panel
      title="时序电路（由方程生成）"
      sub="每个次态方程连成门，D 触发器把 Q 送回左侧"
      actions={<Badge tone="accent">{circuit.gateCount} 个门 · {circuit.dffs.length} 个触发器</Badge>}
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="seq-circuit-toolbar">
          <div className="row" style={{ gap: 6 }}>
            <span className="tiny dim">输入 {inputName}</span>
            <Button size="sm" variant={input === 0 ? "primary" : "ghost"} onClick={() => setInput(0)}>
              0
            </Button>
            <Button size="sm" variant={input === 1 ? "primary" : "ghost"} onClick={() => setInput(1)}>
              1
            </Button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" icon={<Clock size={12} />} onClick={clock}>
              来一个时钟
            </Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={reset}>
              复位
            </Button>
            <Button size="sm" variant="ghost" icon={<Copy size={12} />} onClick={copyNetlist}>
              {copied ? "已复制" : "复制网表"}
            </Button>
          </div>
        </div>

        <div className="seq-circuit-canvas">
          <svg
            viewBox={`0 0 ${bounds.width} ${bounds.height}`}
            role="img"
            aria-label="时序逻辑电路图"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <marker
                id="seq-arrow"
                viewBox="0 0 8 8"
                refX="6.4"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--text-mute)" />
              </marker>
            </defs>

            {circuit.netlist.wires.map((wire) => {
              const from = circuit.netlist.nodes.find((node) => node.id === wire.from);
              const to = circuit.netlist.nodes.find((node) => node.id === wire.to);
              if (!from || !to) return null;
              const a = outputPort(from);
              const b = inputPort(to, wire.toPort);
              const active = (values.get(wire.from) ?? 0) === 1;
              return (
                <path
                  key={wire.id}
                  d={wirePath(a, b)}
                  className={`seq-circuit-wire${active ? " is-high" : ""}`}
                  markerEnd="url(#seq-arrow)"
                />
              );
            })}

            {circuit.netlist.nodes.map((node) => (
              <CircuitNodeView
                key={node.id}
                node={node}
                value={values.get(node.id) ?? 0}
                isOutput={node.kind === "OUTPUT"}
              />
            ))}
          </svg>
        </div>
        <div className="seq-circuit-hint">左右滑动可查看完整电路</div>

        <div className="stat-grid">
          <Stat label="当前状态码" value={stateCode.toString(2).padStart(circuit.dffs.length, "0")} />
          <Stat label="输出 Z" value={outputValue} />
          <Stat label="已走时钟" value={steps} />
          <Stat label="逻辑级数" value={circuit.depth} />
        </div>

        <div className="tiny dim" style={{ lineHeight: 1.7 }}>
          <Cpu size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
          这是「方程 → 门」的生成结果，不是手工连线。触发器用 D 型统一实现：
          JK 方案会先折算成次态再接 D 端，行为与原状态机逐拍一致（测试逐个状态、逐个输入验证过）。
          触发器 D 端悬空时网表会报错，不会静默当成 0。
        </div>
      </div>
    </Panel>
  );
}

function sizeOf(node: GateNode) {
  return NODE_SIZE[node.kind] ?? { w: 60, h: 40 };
}

function outputPort(node: GateNode) {
  const size = sizeOf(node);
  // 非门的线要从取反圈外侧起步，否则箭头会插进圆圈里
  const stub = node.kind === "NOT" ? 10 : 0;
  return { x: node.x + size.w / 2 + stub, y: node.y };
}

function inputPort(node: GateNode, port: number) {
  const size = sizeOf(node);
  const count = Math.max(1, inputPortCount(node));
  if (count === 1) return { x: node.x - size.w / 2, y: node.y };
  const span = Math.min(size.h - 12, (count - 1) * 12);
  const y = node.y - span / 2 + (span / (count - 1)) * port;
  return { x: node.x - size.w / 2, y };
}

function wirePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const forward = b.x >= a.x;
  const bend = Math.max(36, Math.abs(b.x - a.x) * 0.45);
  if (forward) {
    return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
  }
  // 反馈线：从上方绕回去，避免直接穿过中间的逻辑
  const lift = Math.min(a.y, b.y) - 34;
  return `M ${a.x} ${a.y} C ${a.x + 40} ${a.y}, ${a.x + 40} ${lift}, ${(a.x + b.x) / 2} ${lift} S ${
    b.x - 40
  } ${b.y}, ${b.x} ${b.y}`;
}

function CircuitNodeView({
  node,
  value,
  isOutput,
}: {
  node: GateNode;
  value: Bit;
  isOutput: boolean;
}) {
  const { w, h } = sizeOf(node);
  const high = value === 1;

  if (node.kind === "DFF") {
    return (
      <g transform={`translate(${node.x} ${node.y})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} className="seq-node seq-node--dff" />
        <text x={-w / 2 + 10} y={4} className="seq-node__pin">D</text>
        <text x={w / 2 - 10} y={4} textAnchor="end" className="seq-node__pin">Q</text>
        {/* 值贴着 Q 端：它就是这个触发器输出的电平，放正中间会被读成「D=0」 */}
        <text x={w / 2 - 30} y={4} textAnchor="middle" className={`seq-node__value${high ? " is-high" : ""}`}>
          {value}
        </text>
        <text x={0} y={h / 2 + 21} textAnchor="middle" className="seq-node__name">
          {node.label}
        </text>
        <path d={`M ${-8} ${h / 2} L ${-2} ${h / 2 + 6} L ${2} ${h / 2}`} className="seq-node__clock" />
      </g>
    );
  }

  if (node.kind === "INPUT" || node.kind === "CONST" || isOutput) {
    return (
      <g transform={`translate(${node.x} ${node.y})`}>
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={14}
          className={`seq-node${isOutput && high ? " is-high" : ""}`}
        />
        <text x={0} y={5} textAnchor="middle" className="seq-node__io">
          {node.kind === "CONST" ? node.label : node.label || (isOutput ? "Z" : "?")}
        </text>
        {isOutput && (
          <text x={0} y={-h / 2 - 6} textAnchor="middle" className={`seq-node__value${high ? " is-high" : ""}`}>
            {value}
          </text>
        )}
      </g>
    );
  }

  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={5} className="seq-node" />
      <text x={0} y={5} textAnchor="middle" className="seq-node__symbol">
        {node.kind === "AND" ? "&" : node.kind === "OR" ? "≥1" : node.kind === "XOR" ? "=1" : "1"}
      </text>
      {/* IEC 里「1」框本身是缓冲器，取反靠输出端的小圆圈；少了它非门会被读成直通 */}
      {node.kind === "NOT" && <circle cx={w / 2 + 5} cy={0} r={5} className="seq-node__bubble" />}
    </g>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock, RotateCcw, Table2, Zap } from "lucide-react";
import { Badge, Button, Callout, Panel, Segmented, Stat } from "../../components/common";
import { KarnaughMap } from "../../components/math/KarnaughMap";
import type { CellValue } from "../../core/boolean/model";
import { buildKMapLayout } from "../../core/karnaugh/mapping";
import type { MinimizeResult } from "../../core/karnaugh/minimizer";
import {
  codeOf,
  describeEncoding,
  deriveSequential,
  encodingOf,
  excitationOf,
  flipFlopOf,
  machineTypeOf,
  outputAt,
  outputMatrix,
  stateCode,
  stateCodesOf,
  stepState,
  type EncodingScheme,
  type FlipFlopType,
  type MachineType,
  type StateMachine,
  type StepRecord,
} from "../../core/sequential/machine";
import { reduceMachine } from "../../core/sequential/reduction";
import { compareDesigns } from "../../core/sequential/comparison";
import { CostComparePanel } from "./CostComparePanel";
import { RacePanel } from "./RacePanel";
import { TimingPanel } from "./TimingPanel";
import { SequentialCircuitPanel } from "./SequentialCircuitPanel";
import { EncodingPanel } from "./EncodingPanel";
import { ReductionPanel } from "./ReductionPanel";
import { StateDiagram } from "./StateDiagram";

const STORAGE_KEY = "mathbridge.sequential.v1";
const MAX_STEPS = 12;

function makeMachine(stateCount: 2 | 4): StateMachine {
  return {
    stateCount,
    machineType: "moore",
    flipFlop: "D",
    inputName: "X",
    transitions:
      stateCount === 2
        ? [
            [0, 1],
            [0, 1],
          ]
        : [
            [0, 1],
            [0, 2],
            [0, 2],
            [0, 0],
          ],
    outputs: stateCount === 2 ? [0, 1] : [0, 0, 1, 0],
  };
}

const PRESETS: Array<{ label: string; desc: string; machine: StateMachine }> = [
  {
    label: "连续两个 1（Moore）",
    desc: "S0 初始，S1 见到一个 1，S2 见到 11 时输出 1，S3 未使用",
    machine: makeMachine(4),
  },
  {
    label: "连续两个 1（Mealy）",
    desc: "两状态就够：S1 且 X=1 的同一拍立刻输出，不用等下一个时钟",
    machine: {
      stateCount: 2,
      machineType: "mealy",
      flipFlop: "D",
      inputName: "X",
      transitions: [
        [0, 1],
        [0, 1],
      ],
      outputs: [
        [0, 0],
        [0, 1],
      ],
    },
  },
  {
    label: "模 4 计数器",
    desc: "每个时钟前进一格，S3 输出 1，输入 X 不影响转移",
    machine: {
      stateCount: 4,
      machineType: "moore",
      flipFlop: "D",
      inputName: "X",
      transitions: [
        [1, 1],
        [2, 2],
        [3, 3],
        [0, 0],
      ],
      outputs: [0, 0, 0, 1],
    },
  },
  {
    label: "冗余状态（4→2）",
    desc: "S2 与 S0、S3 与 S1 完全等价：化简后只剩 2 个状态，触发器从 2 个减到 1 个",
    machine: {
      stateCount: 4,
      machineType: "moore",
      flipFlop: "D",
      inputName: "X",
      transitions: [
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 0],
      ],
      outputs: [0, 1, 0, 1],
    },
  },
  {
    label: "4→3 的机器",
    desc: "S3 与 S1 等价；状态数减了一个，但位宽仍是 2 位 —— 便于看清「状态数」和「触发器数」不是一回事",
    machine: {
      stateCount: 4,
      machineType: "moore",
      flipFlop: "D",
      inputName: "X",
      transitions: [
        [1, 1],
        [2, 2],
        [0, 0],
        [2, 2],
      ],
      outputs: [0, 0, 1, 0],
    },
  },
  {
    label: "T 触发器",
    desc: "两状态：X=1 时每来一拍翻转一次，X=0 保持",
    machine: {
      stateCount: 2,
      machineType: "moore",
      flipFlop: "JK",
      inputName: "X",
      transitions: [
        [0, 1],
        [1, 0],
      ],
      outputs: [0, 1],
    },
  },
];

function sanitize(raw: unknown): StateMachine | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<StateMachine>;
  const rawCount = Number(record.stateCount);
  const stateCount =
    Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 4 ? rawCount : null;
  if (!stateCount) return null;
  if (!Array.isArray(record.transitions) || record.transitions.length !== stateCount) return null;
  if (!Array.isArray(record.outputs) || record.outputs.length !== stateCount) return null;

  const machineType: MachineType = record.machineType === "mealy" ? "mealy" : "moore";
  const flipFlop: FlipFlopType = record.flipFlop === "JK" ? "JK" : "D";
  const encoding: EncodingScheme = record.encoding === "onehot" ? "onehot" : "binary";

  const transitions: number[][] = [];
  for (let state = 0; state < stateCount; state += 1) {
    const row = record.transitions[state];
    if (!Array.isArray(row) || row.length !== 2) return null;
    transitions.push(
      row.map((value) => {
        const next = Number(value);
        return Number.isInteger(next) && next >= 0 && next < stateCount ? next : 0;
      })
    );
  }

  const outputs: number[] | number[][] =
    machineType === "mealy"
      ? (record.outputs as unknown[]).map((row) =>
          Array.isArray(row)
            ? ([0, 1].map((i) => (Number(row[i]) === 1 ? 1 : 0)) as number[])
            : ([0, 1].map(() => (Number(row) === 1 ? 1 : 0)) as number[])
        )
      : (record.outputs as unknown[]).map((value) =>
          Array.isArray(value) ? (Number(value[0]) === 1 ? 1 : 0) : Number(value) === 1 ? 1 : 0
        );

  const candidate: StateMachine = {
    stateCount,
    machineType,
    flipFlop,
    encoding,
    inputName: typeof record.inputName === "string" && record.inputName ? record.inputName : "X",
    transitions,
    outputs,
  };

  // 自定义码只有合法时才保留；one-hot 由状态数直接生成，不接受存档里的码
  if (encoding === "binary") {
    const codes = stateCodesOf({ ...candidate, stateCodes: record.stateCodes });
    if (codes.some((code, i) => code !== i)) candidate.stateCodes = codes;
  }

  return candidate;
}

function loadMachine(): StateMachine {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeMachine(4);
    return sanitize(JSON.parse(raw)) ?? makeMachine(4);
  } catch {
    return makeMachine(4);
  }
}

/**
 * 两台机器的「状态图」是否相同。
 *
 * 撤销化简不能用对象引用判断：切换编码会生成新对象，但转移关系没变，
 * 这时化简前的表仍然应该能找回。只有真的改了转移 / 输出 / 状态数才失效。
 */
function sameGraph(a: StateMachine, b: StateMachine): boolean {
  return (
    a.stateCount === b.stateCount &&
    machineTypeOf(a) === machineTypeOf(b) &&
    a.inputName === b.inputName &&
    JSON.stringify(a.transitions) === JSON.stringify(b.transitions) &&
    JSON.stringify(a.outputs) === JSON.stringify(b.outputs)
  );
}

/** 改变状态数：缩小时把越界转移夹回 S0，扩大时补上自环状态 */
function resizeMachine(machine: StateMachine, next: number): StateMachine {
  const current = machine.stateCount;
  if (next === current) return machine;
  const mealy = machineTypeOf(machine) === "mealy";
  const matrix = outputMatrix(machine);

  if (next < current) {
    const transitions = machine.transitions
      .slice(0, next)
      .map((row) => row.map((value) => (value >= next ? 0 : value)));
    const outputs = matrix.slice(0, next);
    return {
      ...machine,
      stateCount: next,
      transitions,
      outputs: mealy ? outputs : outputs.map((row) => row[0]),
      stateCodes: undefined,
    };
  }

  const transitions = machine.transitions.map((row) => [...row]);
  const outputs = matrix.map((row) => [...row]);
  for (let index = current; index < next; index += 1) {
    transitions.push([index, index]);
    outputs.push([0, 0]);
  }
  return {
    ...machine,
    stateCount: next,
    transitions,
    outputs: mealy ? outputs : outputs.map((row) => row[0]),
    stateCodes: undefined,
  };
}

export function SequentialStudio() {
  const [machine, setMachine] = useState<StateMachine>(loadMachine);
  const [state, setState] = useState(0);
  const [input, setInput] = useState(0);
  const [history, setHistory] = useState<StepRecord[]>([]);
  /** 化简前的机器；只在没被后续编辑打破时提供撤销 */
  const [undo, setUndo] = useState<{ baseline: StateMachine; merged: StateMachine } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(machine));
    } catch {
      /* 忽略存储失败 */
    }
  }, [machine]);

  // 改动转移表后，模拟从 S0 重来，避免停在已经不存在的状态上
  useEffect(() => {
    setState(0);
    setHistory([]);
  }, [machine]);

  // 两种触发器都推导一遍：一是为了当前展示，二是为了把代价并排摆出来
  const dDesign = useMemo(() => deriveSequential({ ...machine, flipFlop: "D" }), [machine]);
  const jkDesign = useMemo(() => deriveSequential({ ...machine, flipFlop: "JK" }), [machine]);
  const jk = flipFlopOf(machine) === "JK";
  const design = jk ? jkDesign : dDesign;
  const codes = stateCodesOf(machine);
  const stateBits = design.stateBits;
  const mealy = machineTypeOf(machine) === "mealy";
  const onehot = encodingOf(machine) === "onehot";

  const reduction = useMemo(() => reduceMachine(machine), [machine]);
  // 应用化简后仍保留「化简前 → 化简后」的对照，而不是让表格塌成两行
  const canUndo = undo !== null && sameGraph(machine, undo.merged);
  const baseline = canUndo && undo ? undo.baseline : null;
  const comparisonSource = baseline ?? machine;
  const comparisonReduction = useMemo(
    () => (baseline ? reduceMachine(baseline) : reduction),
    [baseline, reduction]
  );
  const comparison = useMemo(
    () => compareDesigns(comparisonSource, comparisonReduction, machine),
    [comparisonSource, comparisonReduction, machine]
  );

  const nextPreview = stepState(machine, state, input);
  const currentOutput = outputAt(machine, state, input);

  const clock = () => {
    const to = stepState(machine, state, input);
    setHistory((current) =>
      [...current, { from: state, input, to, output: outputAt(machine, state, input) }].slice(
        -MAX_STEPS
      )
    );
    setState(to);
  };

  const setTransition = (from: number, onInput: number, to: number) => {
    setMachine((current) => ({
      ...current,
      transitions: current.transitions.map((row, i) =>
        i === from ? row.map((value, j) => (j === onInput ? to : value)) : row
      ),
    }));
  };

  const setOutput = (at: number, onInput: number, value: 0 | 1) => {
    setMachine((current) => {
      if (machineTypeOf(current) === "mealy") {
        const matrix = outputMatrix(current).map((row, i) =>
          i === at ? row.map((v, j) => (j === onInput ? value : v)) : row
        );
        return { ...current, outputs: matrix as number[][] };
      }
      const flat = Array.from({ length: current.stateCount }, (_, i) => outputAt(current, i, 0));
      flat[at] = value;
      return { ...current, outputs: flat };
    });
  };

  const setMachineType = (type: MachineType) => {
    if (type === machineTypeOf(machine)) return;
    setMachine((current) => {
      if (type === "mealy") {
        const matrix = outputMatrix(current);
        return { ...current, machineType: "mealy", outputs: matrix as number[][] };
      }
      const flat = Array.from({ length: current.stateCount }, (_, i) => outputAt(current, i, 0));
      return { ...current, machineType: "moore", outputs: flat };
    });
  };

  const setFlipFlop = (type: FlipFlopType) => {
    setMachine((current) => ({ ...current, flipFlop: type }));
  };

  const changeStateCount = (next: number) => {
    if (next === machine.stateCount) return;
    setMachine((current) => resizeMachine(current, next));
  };

  const setEncoding = (scheme: EncodingScheme) => {
    setMachine((current) => ({ ...current, encoding: scheme, stateCodes: undefined }));
  };

  const applyReduction = (merged: StateMachine) => {
    setUndo({ baseline: machine, merged });
    setMachine(merged);
  };

  const undoReduction = () => {
    if (!undo) return;
    // 找回转移表，但保留用户当前的编码选择
    setMachine({ ...undo.baseline, encoding: machine.encoding });
    setUndo(null);
  };

  const equationGroups = (terms: MinimizeResult["terms"]) =>
    terms.map((term, index) => ({
      id: `g-${index}`,
      cells: term.cells,
      colorIndex: index,
      kind: "auto" as const,
      label: term.literals.length
        ? term.literals.map((l) => `${l.negated ? "¬" : ""}${l.variable}`).join("·")
        : "1",
    }));

  const maps = useMemo(() => {
    const list: Array<{
      key: string;
      title: string;
      variables: string[];
      values: CellValue[];
      result: MinimizeResult;
    }> = [];
    for (const bit of design.bits) {
      if (bit.d) {
        list.push({
          key: bit.d.variable,
          title: bit.d.variable,
          variables: design.variables,
          values: bit.d.values,
          result: bit.d.result,
        });
      }
      if (bit.j && bit.k) {
        list.push({
          key: bit.j.variable,
          title: bit.j.variable,
          variables: design.variables,
          values: bit.j.values,
          result: bit.j.result,
        });
        list.push({
          key: bit.k.variable,
          title: bit.k.variable,
          variables: design.variables,
          values: bit.k.values,
          result: bit.k.result,
        });
      }
    }
    list.push({
      key: "Z",
      title: "Z",
      variables: design.output.variables,
      values: design.output.values,
      result: design.output.result,
    });
    return list;
  }, [design]);

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>状态、时钟与激励方程</h2>
            <p>
              时序电路的输出不只取决于当前输入，还取决于<strong>当前状态</strong>。
              把状态用二进制编码、每个状态位配一个触发器，次态就变成一张普通的真值表 ——
              于是卡诺图那套化简可以原样搬过来。触发器选 D 还是 JK、
              输出取 Moore 还是 Mealy、状态怎么编码，都会改变最终电路。
            </p>
          </div>
          <div className="page-head__actions">
            <Badge tone="accent">{machine.stateCount} 个状态</Badge>
            <Badge tone="mute">{stateBits} 个触发器</Badge>
            <Badge tone="mute">{onehot ? "one-hot" : "二进制"}</Badge>
            <Badge tone="mute">{mealy ? "Mealy" : "Moore"}</Badge>
            <Badge tone="mute">{jk ? "JK" : "D"}</Badge>
            {design.unreachable.length > 0 && (
              <Badge tone="warn">{design.unreachable.length} 个不可达状态</Badge>
            )}
          </div>
        </div>

        <Panel
          title="状态转移表"
          sub={`输入 ${machine.inputName}，${mealy ? "Mealy 型输出（与输入有关）" : "Moore 型输出（只看状态）"}`}
          actions={
            <div className="row" style={{ gap: 6 }}>
              <Segmented
                value={machineTypeOf(machine)}
                onChange={(value) => setMachineType(value as MachineType)}
                label="输出模型"
                options={[
                  { value: "moore", label: "Moore" },
                  { value: "mealy", label: "Mealy" },
                ]}
              />
              <Segmented
                value={String(machine.stateCount)}
                onChange={(value) => changeStateCount(Number(value))}
                label="状态数"
                options={[
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "3", label: "3" },
                  { value: "4", label: "4" },
                ]}
              />
            </div>
          }
        >
          <div className="stack" style={{ gap: 10 }}>
            <div className="table-wrap">
              <table className="seq-table">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>编码</th>
                    <th>{machine.inputName}=0 →</th>
                    <th>{machine.inputName}=1 →</th>
                    {mealy ? (
                      <>
                        <th>Z（{machine.inputName}=0）</th>
                        <th>Z（{machine.inputName}=1）</th>
                      </>
                    ) : (
                      <th>Z</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: machine.stateCount }, (_, s) => (
                    <tr key={s} className={state === s ? "is-current" : undefined}>
                      <td>
                        <span className={`seq-state${state === s ? " is-active" : ""}`}>S{s}</span>
                      </td>
                      <td>
                        <code className="tiny">
                          {stateBits === 0 ? "—" : stateCode(codeOf(machine, s), stateBits)}
                        </code>
                      </td>
                      {[0, 1].map((onInput) => (
                        <td key={onInput}>
                          <select
                            className="input seq-select"
                            value={machine.transitions[s][onInput]}
                            aria-label={`S${s} 在 ${machine.inputName}=${onInput} 时转移到`}
                            onChange={(event) =>
                              setTransition(s, onInput, Number(event.target.value))
                            }
                          >
                            {Array.from({ length: machine.stateCount }, (_, target) => (
                              <option key={target} value={target}>
                                S{target}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                      {(mealy ? [0, 1] : [0]).map((onInput) => (
                        <td key={`out-${onInput}`}>
                          <div className="seq-output">
                            {[0, 1].map((value) => (
                              <button
                                key={value}
                                type="button"
                                className={`seq-output__btn${
                                  outputAt(machine, s, onInput) === value ? " is-on" : ""
                                }`}
                                aria-pressed={outputAt(machine, s, onInput) === value}
                                aria-label={`S${s} 在 ${machine.inputName}=${onInput} 时输出 ${value}`}
                                onClick={() => setOutput(s, onInput, value as 0 | 1)}
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row wrap" style={{ gap: 6 }}>
              <span className="tiny dim">示例：</span>
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant="ghost"
                  title={preset.desc}
                  onClick={() => setMachine(sanitize(preset.machine) ?? makeMachine(4))}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw size={11} />}
                onClick={() => setMachine(makeMachine(4))}
              >
                重置
              </Button>
            </div>

            {design.warnings.length > 0 && (
              <Callout tone="warn">
                {design.warnings.map((warning) => (
                  <div key={warning} className="small">
                    {warning}
                  </div>
                ))}
              </Callout>
            )}
          </div>
        </Panel>

        <ReductionPanel
          machine={machine}
          reduction={reduction}
          onApply={applyReduction}
          canUndo={canUndo}
          onUndo={undoReduction}
        />

        <EncodingPanel
          machine={machine}
          onCodes={(next) => setMachine((current) => ({ ...current, stateCodes: next }))}
          onEncoding={setEncoding}
        />

        <CostComparePanel comparison={comparison} />

        <RacePanel machine={machine} />

        <TimingPanel machine={machine} design={dDesign} />

        <div className="seq-pair">
          <Panel
            title="激励方程"
            sub={jk ? "由激励表反推 J、K，无关项参与化简" : "D 端直接接次态，一条方程一位"}
            actions={
              <Segmented
                value={flipFlopOf(machine)}
                onChange={(value) => setFlipFlop(value as FlipFlopType)}
                label="触发器"
                options={[
                  { value: "D", label: "D" },
                  { value: "JK", label: "JK" },
                ]}
              />
            }
          >
            <div className="stack" style={{ gap: 8 }}>
              {design.equations.map((equation) => (
                <div className="formula" key={equation.variable}>
                  {equation.variable} = {equation.result.expression}
                </div>
              ))}

              <div className="row wrap" style={{ gap: 6 }}>
                <Badge tone="mute">{design.totalTerms} 个乘积项</Badge>
                <Badge tone="mute">{design.totalLiterals} 个文字</Badge>
                <Badge tone={design.unreachable.length ? "warn" : "ok"}>
                  {design.unreachable.length ? "含不可达状态" : "全部状态可达"}
                </Badge>
              </div>

              <div className="flip-compare">
                <div className={`flip-compare__row${jk ? "" : " is-active"}`}>
                  <span className="small">D 型</span>
                  <span className="mono">{dDesign.totalLiterals}</span>
                  <span className="tiny dim">
                    文字 · {dDesign.equations.length} 条方程 · 每位 1 个 D 端
                  </span>
                </div>
                <div className={`flip-compare__row${jk ? " is-active" : ""}`}>
                  <span className="small">JK 型</span>
                  <span className="mono">{jkDesign.totalLiterals}</span>
                  <span className="tiny dim">
                    文字 · {jkDesign.equations.length} 条方程 · 每位 2 个 J/K 端
                  </span>
                </div>
                <div className="tiny dim" style={{ lineHeight: 1.6 }}>
                  JK 每位要两条方程，但 J/K 里大量组合是<strong>无关项</strong>（Q=0 时 K 随便、Q=1 时 J 随便），
                  方程往往更简单。D 型胜在接线简单：一条线接 D 端。文字数少不等于总门数少，两者要分开看。
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="逐拍模拟" sub="不自动运行：先想清楚下一拍会到哪">
            <div className="stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" variant="primary" block icon={<Clock size={13} />} onClick={clock}>
                  来一个时钟
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw size={12} />}
                  onClick={() => {
                    setState(0);
                    setHistory([]);
                  }}
                  title="回到 S0 并清空历史"
                />
              </div>
              <div className="seq-now">
                <div className="seq-now__state">
                  <span className="field__label">当前状态</span>
                  <div className="seq-now__value">
                    S{state}
                    <code>{stateBits === 0 ? "—" : stateCode(codeOf(machine, state), stateBits)}</code>
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: "var(--text-mute)" }} />
                <div className="seq-now__state">
                  <span className="field__label">下一状态</span>
                  <div className="seq-now__value is-next">
                    S{nextPreview}
                    <code>
                      {stateBits === 0 ? "—" : stateCode(codeOf(machine, nextPreview), stateBits)}
                    </code>
                  </div>
                </div>
                <div className="seq-now__state">
                  <span className="field__label">
                    输出 Z{mealy ? `（${machine.inputName}=${input}）` : ""}
                  </span>
                  <div className={`seq-now__value ${currentOutput === 1 ? "is-one" : ""}`}>
                    {currentOutput}
                  </div>
                </div>
              </div>

              <div>
                <div className="field__label" style={{ marginBottom: 4 }}>
                  当前输入 {machine.inputName}
                </div>
                <Segmented
                  block
                  value={String(input)}
                  onChange={(value) => setInput(Number(value))}
                  label="当前输入"
                  options={[
                    { value: "0", label: `${machine.inputName}=0` },
                    { value: "1", label: `${machine.inputName}=1` },
                  ]}
                />
              </div>

              <div>
                <div className="field__label" style={{ marginBottom: 5 }}>
                  走过的拍子
                </div>
                {history.length === 0 ? (
                  <div className="tiny dim">还没有时钟沿。设置输入后点「来一个时钟」。</div>
                ) : (
                  <div className="seq-history">
                    {history.map((step, index) => (
                      <span className="seq-step" key={index}>
                        <span className="seq-step__from">S{step.from}</span>
                        <span className="seq-step__input">
                          {machine.inputName}={step.input}
                        </span>
                        <ArrowRight size={10} />
                        <span className="seq-step__to">S{step.to}</span>
                        <span className="seq-step__out">Z={step.output}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="stat-grid">
                <Stat label="状态位" value={stateBits} />
                <Stat label="触发器" value={stateBits} />
                <Stat label="已走拍数" value={history.length} />
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="状态图"
          sub="点击状态可把它设为当前状态"
          actions={<Badge tone="mute">{mealy ? "Mealy" : "Moore"}</Badge>}
        >
          <StateDiagram machine={machine} activeState={state} onSelectState={setState} />
        </Panel>

        <SequentialCircuitPanel design={dDesign} inputName={machine.inputName} />

        <Panel
          title={onehot ? "one-hot 为什么不画卡诺图" : "激励方程卡诺图"}
          sub={
            onehot
              ? "没有相邻码字，分组失去意义；方程仍按同一套规则最小化"
              : jk
              ? "每一对 J/K 各一张，X 是激励表带来的无关项"
              : "状态位 × 输入，与组合电路完全同一套化简"
          }
          actions={
            onehot ? (
              <Badge tone="mute">无需画图</Badge>
            ) : (
              <Badge tone="accent">
                {mealy ? design.variables.join("") : design.stateVariables.join("")}
              </Badge>
            )
          }
        >
          {onehot && (
            <div className="onehot-kmap-note">
              <p className="small muted">
                one-hot 的合法码字只有一个 1，任意两个状态位都不构成格雷邻接，
                卡诺图的分组在这里没有意义。D 方程通常直接从转移写出（见上方「状态编码」）；
                这里仍把它们交给同一套最小化，但不画图 —— {stateBits} 个状态位加输入共{" "}
                {design.variables.length} 个变量，{1 << design.variables.length} 格的图反而看不清。
              </p>
              <div className="onehot-kmap-note__grid">
                {design.equations.map((equation) => (
                  <div className="formula" key={equation.variable}>
                    {equation.variable} = {equation.result.expression}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!onehot && (
          <div className="seq-kmap-grid">
            {maps.map((item) => (
              <div className="multi-kmap" key={item.key}>
                <div className="multi-kmap__head">
                  <strong>{item.title}</strong>
                  <code className="tiny">= {item.result.expression}</code>
                </div>
                <KarnaughMap
                  layout={buildKMapLayout(item.variables)}
                  values={item.values}
                  groups={equationGroups(item.result.terms)}
                  showMinterms
                  interactive={false}
                  ariaLabel={`${item.title} 的卡诺图`}
                />
              </div>
            ))}
          </div>
          )}
        </Panel>

      </main>

      <aside className="inspector" aria-label="说明">
        <Panel
          title={jk ? "JK 激励表怎么来的" : "为什么是 D 触发器"}
          actions={<Zap size={14} style={{ color: "var(--text-mute)" }} />}
        >
          <div className="stack" style={{ gap: 8 }}>
            {jk ? (
              <>
                <p className="small muted" style={{ lineHeight: 1.7 }}>
                  JK 触发器有两个输入：J=1 置 1，K=1 清 0，都置 0 保持，都置 1 翻转。
                  所以「想让 Q 从 0 变 1」只需要 J=1，K 取什么无所谓 —— 这就是无关项的来源。
                </p>
                <table className="excitation-table">
                  <thead>
                    <tr>
                      <th>Q</th>
                      <th>Q⁺</th>
                      <th>J</th>
                      <th>K</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      excitationOf(0, 0),
                      excitationOf(0, 1),
                      excitationOf(1, 0),
                      excitationOf(1, 1),
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>{i < 2 ? 0 : 1}</td>
                        <td>{i % 2}</td>
                        <td>{row.j}</td>
                        <td>{row.k}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="tiny dim" style={{ lineHeight: 1.6 }}>
                  把每位的 Q、Q⁺ 换成 J、K，K 表里凡是 Q=0 的行都填 X，J 表里 Q=1 的行填 X，
                  再交给卡诺图 —— 无关项越多，圈可以越大。
                </p>
              </>
            ) : (
              <>
                <p className="small muted" style={{ lineHeight: 1.7 }}>
                  D 触发器的规则最简单：时钟沿到来时，<code>Q ← D</code>。
                  所以只要把「次态」算出来接到 D 端，电路就会在下一拍自动走到该去的地方。
                </p>
                <p className="small muted" style={{ lineHeight: 1.7 }}>
                  切到 JK 可以看到同一台机器的另一种实现：方程更零碎，但单个方程往往更短。
                </p>
              </>
            )}
          </div>
        </Panel>

        <Panel title="编码约定">
          <ul className="stack" style={{ gap: 6 }}>
            {[
              stateBits === 0
                ? "只剩 1 个状态：不需要状态位，也没有触发器"
                : onehot
                ? `${machine.stateCount} 个状态各占一位，共 ${stateBits} 个触发器`
                : `${machine.stateCount} 个状态用 ${stateBits} 位二进制编码`,
              `状态位记作 ${design.stateVariables.join("、")}，输入为 ${machine.inputName}`,
              mealy ? "Mealy 型：Z = f(状态, 输入)" : "Moore 型：Z = f(状态)",
              "方程真值表的行序 = 状态编码 · 输入",
              "不可达状态仍然要实现，不能当无关项",
              `当前编码：${describeEncoding(machine, codes)}`,
            ].map((line) => (
              <li key={line} className="tiny muted" style={{ lineHeight: 1.6 }}>
                · {line}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="试一试" actions={<Table2 size={14} style={{ color: "var(--text-mute)" }} />}>
          <div className="tiny muted" style={{ lineHeight: 1.7 }}>
            1. 切到 Mealy：两状态就能检测「连续两个 1」，因为输出不必等下一个时钟。
            <br />
            2. 切到 JK：看 J/K 卡诺图里的 X 如何让圈变大。
            <br />
            3. 在「状态编码」里应用另一种二进制分配，看方程文字数怎么变 ——
            状态还是那几个状态，只是换了二进制名字。
            <br />
            4. 选「冗余状态（4→2）」看化简：状态数减半，触发器跟着从 2 个变成 1 个。
            <br />
            5. 再切到 one-hot：触发器变成 2 个，但每条 D 只剩一个文字 —— 这就是
            「用触发器换门」的具体数字。
          </div>
        </Panel>
      </aside>
    </>
  );
}

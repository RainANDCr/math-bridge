import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Pencil, ShieldCheck } from "lucide-react";
import { useApp } from "../../store/appStore";
import { Badge, Button, Callout, Panel, Stat } from "../../components/common";
import { ExpressionEditor, type ExpressionErrorInfo } from "../../components/math/ExpressionEditor";
import { TruthTable, cycleValue, truthTableCsv } from "../../components/math/TruthTable";
import { KarnaughMap } from "../../components/math/KarnaughMap";
import { CircuitDiagram } from "../../components/math/CircuitDiagram";
import { AstTree } from "../../components/math/AstTree";
import { GateIcon } from "../../components/math/GateIcon";
import { DivisionPanel } from "./DivisionPanel";
import { NotationBoard } from "../../components/notation/NotationBoard";
import { NotationFormula } from "../../components/notation/NotationFormula";
import { GATES, GATE_KINDS, gateTruth, type GateKind } from "../../core/logic-gates/gates";
import {
  canonicalSopAst,
  renderNotation,
} from "../../core/notation/notationConversion";
import {
  buildKMapLayout,
  type KMapLayout,
} from "../../core/karnaugh/mapping";
import { buildCircuit } from "../../core/circuit/model";
import { layoutCircuit } from "../../core/circuit/layout";
import { evaluateCircuit } from "../../core/circuit/evaluator";
import { minimizeValues } from "../../core/karnaugh/minimizer";
import { sopToAst } from "../../core/karnaugh/sopAst";

import {
  MAX_KARNAUGH_VARIABLES,
  dontCareList,
  maxtermList,
  mintermList,
  mintermNotation,
} from "../../core/boolean/model";
import type { BoolNode } from "../../core/boolean/ast";

/** 逻辑工作台只陈列七种「运算门」；缓冲器不是布尔运算，放在符号百科里讲 */
const GATE_ORDER: GateKind[] = GATE_KINDS.filter((kind) => kind !== "BUFFER");

export function LogicStudio() {
  const { state, actions } = useApp();
  const fn = state.fn;

  const [error, setError] = useState<ExpressionErrorInfo | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editable, setEditable] = useState(false);
  const [assignment, setAssignment] = useState<Record<string, 0 | 1>>({});
  const [demo, setDemo] = useState<GateKind>("AND");

  // 输入停顿 260ms 后自动解析并同步整条链路
  useEffect(() => {
    if (state.expressionDraft === state.expressionInput) {
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const result = actions.applyExpression(state.expressionDraft, { silent: true });
      setError(result.ok ? null : result.error ?? null);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [state.expressionDraft, state.expressionInput, actions]);

  const circuitAst = useMemo<BoolNode>(() => {
    if (fn.ast) return fn.ast;
    if (fn.variables.length === 0) {
      return { kind: "const", value: fn.values[0] === 1 ? 1 : 0 } as BoolNode;
    }
    const sop = minimizeValues(fn.variables, fn.values);
    return sopToAst(sop.terms, fn.variables);
  }, [fn]);

  const circuit = useMemo(() => buildCircuit(circuitAst), [circuitAst]);
  const layout = useMemo(() => layoutCircuit(circuit), [circuit]);
  const circuitValues = useMemo(() => evaluateCircuit(circuit, assignment), [circuit, assignment]);

  const kmapLayout = useMemo<KMapLayout | null>(() => {
    if (fn.variables.length < 2 || fn.variables.length > MAX_KARNAUGH_VARIABLES) return null;
    return buildKMapLayout(fn.variables);
  }, [fn.variables]);

  const minterms = useMemo(() => mintermList(fn), [fn]);
  const dcs = useMemo(() => dontCareList(fn), [fn]);
  const canonical = useMemo(() => canonicalSopAst(fn), [fn]);

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(truthTableCsv(fn));
      actions.notify("ok", "真值表已复制为 CSV，可直接粘贴到表格软件");
    } catch {
      actions.notify("error", "浏览器拒绝访问剪贴板，请手动选择表格内容复制");
    }
  };

  const toggleInput = (variable: string) => {
    setAssignment((prev) => ({ ...prev, [variable]: (prev[variable] ?? 0) === 1 ? 0 : 1 }));
  };

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>从表达式到电路</h2>
            <p>
              修改表达式，真值表、卡诺图与门级电路会同步更新。点击下方输入端的 A/B/C
              可以直接给电路“通电”，观察信号如何一路传递到输出 F。
            </p>
          </div>
        </div>

        <div className="split-main">
          <div className="stack" style={{ gap: 14 }}>
            <Panel
              title="逻辑表达式"
              sub="F = 前缀可写可不写；输出是等号右边的函数"
              actions={
                <Badge tone={error ? "danger" : "ok"}>
                  {error ? "语法错误" : `${fn.variables.length} 变量`}
                </Badge>
              }
            >
              <ExpressionEditor
                value={state.expressionDraft}
                onChange={actions.setDraft}
                error={error}
                variables={fn.variables}
                mintermCount={minterms.length}
                dontCareCount={dcs.length}
                rows={fn.values.length}
                history={state.recentExpressions.filter((r) => r !== state.expressionInput).slice(0, 4)}
                onReset={actions.resetExperiment}
                notation={state.notationMode}
              />
            </Panel>

            <Panel
              title="同一函数的跨学科写法"
              sub="只改变记号，不改变函数"
              actions={<Badge tone="mute">Notation</Badge>}
            >
              <NotationBoard ast={circuitAst} heading="选择一种学科语言" />
            </Panel>

            <Panel
              title="真值表"
              sub={`${fn.values.length} 行`}
              actions={
                <>
                  <Button
                    variant={editable ? "primary" : "ghost"}
                    size="sm"
                    icon={<Pencil size={12} />}
                    aria-pressed={editable}
                    onClick={() => setEditable((v) => !v)}
                    title="开启后点击输出值即可切换 0 / 1 / X"
                  >
                    {editable ? "编辑中" : "编辑"}
                  </Button>
                  <Button variant="ghost" size="sm" icon={<Copy size={12} />} onClick={copyCsv}>
                    CSV
                  </Button>
                </>
              }
              flush
            >
              <TruthTable
                fn={fn}
                selectedRow={selectedRow}
                onSelectRow={setSelectedRow}
                editable={editable}
                onCycle={(index) => actions.setCell(index, cycleValue(fn.values[index]))}
              />
            </Panel>

            <Panel
              title="逻辑电路"
              sub={fn.ast ? "由表达式直接生成" : "由最简与或式生成"}
              actions={
                <div className="input-toggles">
                  {fn.variables.map((variable) => {
                    const on = (assignment[variable] ?? 0) === 1;
                    return (
                      <button
                        key={variable}
                        type="button"
                        className={`input-toggle ${on ? "is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleInput(variable)}
                      >
                        <span className="input-toggle__lamp" />
                        {variable}
                      </button>
                    );
                  })}
                </div>
              }
            >
              <CircuitDiagram
                circuit={circuit}
                layout={layout}
                values={circuitValues}
                onToggleInput={toggleInput}
              />
              <div className="row" style={{ marginTop: 6, gap: 12 }}>
                <span className="small dim">输出</span>
                <Badge tone={circuitValues.get(circuit.outputId) === 1 ? "ok" : "mute"}>
                  F = {circuitValues.get(circuit.outputId) ?? 0}
                </Badge>
                <span className="tiny dim">
                  点击输入端方块或上方变量按钮切换电平；连线为蓝色表示信号为 1
                </span>
              </div>
            </Panel>
          </div>

          <div className="stack" style={{ gap: 14 }}>
            <Panel title="逻辑运算演示" sub="七种基本门">
              <div className="gate-grid">
                {GATE_ORDER.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`gate-chip ${demo === kind ? "is-active" : ""}`}
                    onClick={() => setDemo(kind)}
                    aria-pressed={demo === kind}
                  >
                    <span className="gate-chip__name">
                      {GATES[kind].zh}
                      <span className="tiny dim">{kind}</span>
                    </span>
                    <GateIcon kind={kind} width={48} height={26} high={demo === kind} />
                    <span className="gate-chip__expr">
                      {renderNotation(GATES[kind].ast, "digital", state.notationStyle).text}
                    </span>
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 12, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                <div className="row-between">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {GATES[demo].zh} · {GATES[demo].en}
                    </div>
                    <div className="tiny dim">{GATES[demo].summary}</div>
                  </div>
                  <GateIcon kind={demo} width={62} height={34} high />
                </div>
                <table className="mini-tt" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>A</th>
                      {demo !== "NOT" && <th>B</th>}
                      <th>F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateTruth(demo).map((row, i) => (
                      <tr key={i}>
                        <td>{row.a}</td>
                        {row.b !== undefined && <td>{row.b}</td>}
                        <td className={row.f === 1 ? "is-one" : ""}>{row.f}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="表达式结构"
              sub={fn.ast ? "抽象语法树" : "当前函数来自真值表"}
              actions={<Badge tone="mute">AST</Badge>}
            >
              {fn.ast ? (
                <div className="ast-tree">
                  <AstTree node={fn.ast} />
                </div>
              ) : (
                <Callout tone="plain">
                  这个函数是通过真值表或最小项直接定义的，没有对应的表达式结构。在上方输入表达式即可恢复语法树。
                </Callout>
              )}
            </Panel>

            {kmapLayout && (
              <Panel title="卡诺图预览" sub="点击进入工作室" actions={<Badge tone="accent">Gray</Badge>}>
                <KarnaughMap
                  layout={kmapLayout}
                  values={fn.values}
                  groups={[]}
                  showMinterms
                  interactive={false}
                />
                <Button
                  size="sm"
                  style={{ marginTop: 8 }}
                  onClick={() => actions.setStudio("karnaugh")}
                >
                  打开卡诺图工作室
                </Button>
              </Panel>
            )}

            <DivisionPanel ast={circuitAst} variables={fn.variables} values={fn.values} />
          </div>
        </div>
      </main>

      <aside className="inspector" aria-label="函数信息">
        <Panel title="函数档案" actions={<Badge tone="mute">{fn.variables.join("") || "常量"}</Badge>}>
          <div className="stat-grid">
            <Stat label="变量数" value={fn.variables.length} />
            <Stat label="真值表行数" value={fn.values.length} />
            <Stat label="最小项" value={minterms.length} />
            <Stat label="无关项" value={dcs.length} />
          </div>
          <div className="stack" style={{ gap: 7, marginTop: 10 }}>
            <div>
              <div className="field__label">最小项记号</div>
              <div className="formula">{mintermNotation(fn)}</div>
            </div>
            <div>
              <div className="field__label">最大项记号</div>
              <div className="formula">{maxtermList(fn).length ? `ΠM(${maxtermList(fn).join(", ")})` : "无（恒为 1）"}</div>
            </div>
            <div>
              <div className="field__label">规范与或式</div>
              <div className="formula" style={{ whiteSpace: "pre-wrap" }}>
                {canonical ? (
                  <NotationFormula
                    value={renderNotation(canonical, state.notationMode === "all" ? "digital" : state.notationMode, state.notationStyle).nodes}
                  />
                ) : (
                  "项数过多，请查看卡诺图化简结果"
                )}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="运算优先级">
          <ol className="stack" style={{ gap: 6 }}>
            {[
              { op: "NOT  ¬", desc: "最高，只作用于紧跟其后的一个操作数" },
              { op: "AND  ·", desc: "其次，先算与" },
              { op: "XOR  ⊕", desc: "再次" },
              { op: "OR  +", desc: "最低，最后算或" },
            ].map((row, i) => (
              <li key={row.op} className="row" style={{ alignItems: "flex-start", gap: 8 }}>
                <span className="badge badge--mute" style={{ fontFamily: "var(--font-mono)" }}>
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.op}</div>
                  <div className="tiny dim">{row.desc}</div>
                </div>
              </li>
            ))}
          </ol>
          <Callout tone="plain">
            同为同级时从左到右结合。例如 <code>A ⊕ B·C</code> 等价于 <code>A ⊕ (B·C)</code> —— 与比异或先算。
          </Callout>
        </Panel>

        <Panel title="我正在观察什么">
          <ul className="stack" style={{ gap: 8 }}>
            <li className="small muted">
              1. 真值表是函数的完整定义：改了任何一个输出，函数就变了。
            </li>
            <li className="small muted">
              2. 电路里点亮的连线表示该点电平为 1，可以逐级验证表达式每一步的取值。
            </li>
            <li className="small muted">
              3. 卡诺图预览中的绿色格子就是最小项，它们在图上相邻才能合并。
            </li>
          </ul>
        </Panel>

        <Panel title="验证" actions={<ShieldCheck size={14} style={{ color: "var(--ok)" }} />}>
          <div className="row" style={{ gap: 6 }}>
            <Check size={13} style={{ color: "var(--ok)" }} />
            <span className="small muted">
              真值表与表达式由同一个求值器生成，行数 = 2<sup>{fn.variables.length}</sup> ={" "}
              {fn.values.length}
            </span>
          </div>
        </Panel>
      </aside>
    </>
  );
}

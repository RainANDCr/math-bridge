import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Eraser,
  Plus,
  Redo2,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useApp } from "../../store/appStore";
import {
  Badge,
  Button,
  Callout,
  Panel,
  Segmented,
  Stat,
} from "../../components/common";
import { ExpressionEditor, type ExpressionErrorInfo } from "../../components/math/ExpressionEditor";
import { TruthTable, cycleValue } from "../../components/math/TruthTable";
import { KarnaughMap, groupColor, type KMapGroupView } from "../../components/math/KarnaughMap";
import { NotationFormula } from "../../components/notation/NotationFormula";
import { NotationSwitcher } from "../../components/notation/NotationBoard";
import {
  clauseToNotation,
  renderAllDisciplines,
  renderNotation,
  termToNotation,
} from "../../core/notation/notationConversion";
import { DISCIPLINE_MAP } from "../../core/notation/notationTypes";
import { parse } from "../../core/boolean/parser";
import { buildKMapLayout } from "../../core/karnaugh/mapping";
import { cubeFromCells } from "../../core/karnaugh/implicants";
import { sopToAst } from "../../core/karnaugh/sopAst";
import {
  explainGroup,
  minimizePosValues,
  minimizeValues,
} from "../../core/karnaugh/minimizer";
import { validatePos, validateSop } from "../../core/karnaugh/validation";
import { parseIndexList } from "../../core/boolean/mintermInput";
import { DerivationPanel } from "./DerivationPanel";
import { HazardPanel } from "./HazardPanel";
import { countLiterals } from "../../core/boolean/printer";
import {
  ALL_VARIABLES,
  MAX_KARNAUGH_VARIABLES,
  dontCareList,
  mintermList,
  onesCount,
} from "../../core/boolean/model";

type KMapMode = "auto" | "manual" | "edit";
type ResultMode = "sop" | "pos";

export function KarnaughStudio() {
  const { state, actions, canUndo, canRedo } = useApp();
  const fn = state.fn;
  const n = fn.variables.length;
  const supported = n >= 2 && n <= MAX_KARNAUGH_VARIABLES;

  const [mode, setMode] = useState<KMapMode>("auto");
  const [resultMode, setResultMode] = useState<ResultMode>("sop");
  const [pending, setPending] = useState<number[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const [showMinterms, setShowMinterms] = useState(true);
  const [showGrayCode, setShowGrayCode] = useState(true);
  const [inputTab, setInputTab] = useState<"expression" | "minterms" | "table">("expression");
  const [error, setError] = useState<ExpressionErrorInfo | null>(null);

  const [varCount, setVarCount] = useState(() => Math.min(6, Math.max(2, n || 3)));
  const [mintText, setMintText] = useState(() => mintermList(fn).join(", "));
  const [dcText, setDcText] = useState(() => dontCareList(fn).join(", "));
  const [mintError, setMintError] = useState<string | null>(null);

  useEffect(() => {
    if (n >= 2 && n <= 6) setVarCount(n);
  }, [n]);

  // 表达式实时解析（与逻辑工作台共用同一份函数模型）
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

  const layout = useMemo(() => (supported ? buildKMapLayout(fn.variables) : null), [fn.variables, supported]);

  const sop = useMemo(
    () => (n > 0 ? minimizeValues(fn.variables, fn.values) : null),
    [fn]
  );
  const pos = useMemo(
    () => (n > 0 ? minimizePosValues(fn.variables, fn.values) : null),
    [fn]
  );

  const sopValidation = useMemo(() => (sop ? validateSop(fn, sop.terms) : null), [fn, sop]);
  const posValidation = useMemo(() => (pos ? validatePos(fn, pos.clauses) : null), [fn, pos]);

  const minterms = useMemo(() => mintermList(fn), [fn]);

  /** K 图内标签按当前记法渲染；「全学科」时标签退回数字电路记法（一行放不下五种写法） */
  const labelMode = state.notationMode === "all" ? "digital" : state.notationMode;
  const labelStyle = state.notationStyle;
  const termLabel = (literals: Parameters<typeof termToNotation>[0]) =>
    termToNotation(literals, labelMode, labelStyle);
  const clauseLabel = (literals: Parameters<typeof clauseToNotation>[0]) =>
    clauseToNotation(literals, labelMode, labelStyle);

  const sopAst = useMemo(() => (sop ? sopToAst(sop.terms, fn.variables) : null), [sop, fn.variables]);
  const posAst = useMemo(() => {
    if (!pos) return null;
    try {
      return parse(pos.expression);
    } catch {
      return null;
    }
  }, [pos]);
  const resultAst = resultMode === "sop" ? sopAst : posAst;
  const ones = useMemo(() => onesCount(fn), [fn]);

  const autoGroups: KMapGroupView[] = useMemo(() => {
    if (!sop) return [];
    return sop.terms.map((term, i) => ({
      id: `auto-${i}`,
      cells: term.cells,
      colorIndex: i,
      kind: "auto" as const,
      label: termLabel(term.literals),
    }));
  }, [sop, labelMode, labelStyle]);

  const posGroups: KMapGroupView[] = useMemo(() => {
    if (!pos) return [];
    return pos.clauses.map((clause, i) => ({
      id: `pos-${i}`,
      cells: clause.cube.cells,
      colorIndex: i,
      kind: "alt" as const,
      label: clauseLabel(clause.cube.literals),
    }));
  }, [pos, labelMode, labelStyle]);

  const manualViews = useMemo(() => {
    if (!supported) return [];
    return state.manual.groups.map((group, i) => {
      const check = cubeFromCells(group.cells, fn.variables, n);
      const badCell = group.cells.find((m) => fn.values[m] === 0);
      return {
        group,
        check,
        colorIndex: i + 3,
        valid: check.ok && badCell === undefined,
        error: badCell !== undefined ? `m${badCell} 的值为 0` : check.reason,
      };
    });
  }, [state.manual.groups, fn, n, supported, labelMode, labelStyle]);

  const manualCovered = useMemo(() => {
    const set = new Set<number>();
    manualViews.forEach((view) => {
      if (view.valid) view.group.cells.forEach((m) => set.add(m));
    });
    return set;
  }, [manualViews]);

  const uncoveredOnes = useMemo(
    () => minterms.filter((m) => !manualCovered.has(m)),
    [minterms, manualCovered]
  );

  const pendingCheck = useMemo(() => {
    if (!supported || pending.length === 0) return null;
    const bad = pending.find((m) => fn.values[m] === 0);
    if (bad !== undefined) {
      return { ok: false as const, cube: null, reason: `m${bad} 的函数值为 0，分组只能包含 1 或 X` };
    }
    return cubeFromCells(pending, fn.variables, n);
  }, [pending, fn, n, supported]);

  const displayGroups: KMapGroupView[] =
    mode === "manual"
      ? manualViews
          .filter((v) => v.valid)
          .map((v) => ({
            id: v.group.id,
            cells: v.group.cells,
            colorIndex: v.colorIndex,
            kind: "manual" as const,
            label: v.check.cube ? termLabel(v.check.cube.literals) : undefined,
          }))
      : resultMode === "sop"
      ? autoGroups
      : posGroups;

  const togglePending = (minterm: number) => {
    setPending((prev) =>
      prev.includes(minterm) ? prev.filter((m) => m !== minterm) : [...prev, minterm]
    );
  };

  const handleCellClick = (minterm: number) => {
    if (mode === "edit") {
      actions.setCell(minterm, cycleValue(fn.values[minterm]));
      return;
    }
    if (mode === "manual") {
      togglePending(minterm);
      return;
    }
    setInspected((prev) => (prev === minterm ? null : minterm));
  };

  const addGroup = () => {
    if (!pendingCheck?.ok) return;
    const result = actions.addManualGroup(pending);
    if (!result.ok) {
      actions.notify("warn", result.error ?? "无法添加分组");
      return;
    }
    setPending([]);
    actions.notify("ok", "分组已添加");
  };

  const applyMinterms = () => {
    setMintError(null);
    const m = parseIndexList(mintText);
    if (!m.ok) {
      setMintError(m.error);
      return;
    }
    const d = parseIndexList(dcText);
    if (!d.ok) {
      setMintError(d.error);
      return;
    }
    const total = 1 << varCount;
    const bad = [...m.values, ...d.values].find((v) => v < 0 || v >= total);
    if (bad !== undefined) {
      setMintError(`编号 ${bad} 超出 ${varCount} 变量范围 0–${total - 1}`);
      return;
    }
    const result = actions.applyMinterms(ALL_VARIABLES.slice(0, varCount), m.values, d.values);
    if (!result.ok) {
      setMintError(result.error?.message ?? "生成失败");
    }
  };

  const literalsBefore = fn.ast ? countLiterals(fn.ast) : null;
  const literalsAfter = sop?.literalCount ?? 0;

  const inspectedGroups = useMemo(() => {
    if (inspected === null) return [] as KMapGroupView[];
    const source: KMapGroupView[] =
      mode === "manual" ? displayGroups : resultMode === "sop" ? autoGroups : posGroups;
    return source.filter((group) => group.cells.includes(inspected));
  }, [inspected, mode, resultMode, autoGroups, posGroups, displayGroups]);

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>格雷码网格上的化简</h2>
            <p>
              卡诺图把「逻辑相邻」画成「几何相邻」。圈出的每一组 2ᵏ 个格子都对应一个可以消去若干变量的乘积项，
              把所有 1 都覆盖之后，就得到最简与或式。
            </p>
          </div>
          <div className="page-head__actions">
            <Badge tone={supported ? "accent" : "warn"}>
              {n} 变量 · {supported ? "已启用" : "不支持绘图"}
            </Badge>
            {sopValidation && (
              <Badge tone={sopValidation.ok ? "ok" : "danger"}>
                {sopValidation.ok ? "等价验证通过" : "验证失败"}
              </Badge>
            )}
          </div>
        </div>

        <div className="split-main">
          <div className="stack" style={{ gap: 14 }}>
            <Panel
              title="卡诺图"
              sub={
                supported
                  ? `行 ${layout?.rowVariables.join("")} · 列 ${layout?.colVariables.join("")}${
                      layout && layout.planeVariables.length > 0
                        ? ` · ${layout.planes.length} 页（${layout.planeVariables.join("")}）`
                        : ""
                    }`
                  : undefined
              }
              actions={
                supported ? (
                  <>
                    <Segmented
                      value={mode}
                      onChange={(value) => {
                        setMode(value);
                        setPending([]);
                      }}
                      label="卡诺图模式"
                      options={[
                        { value: "auto", label: "自动分组" },
                        { value: "manual", label: "手动分组" },
                        { value: "edit", label: "编辑取值" },
                      ]}
                    />
                  </>
                ) : undefined
              }
            >
              {supported && layout ? (
                <div className="kmap-shell">
                  <div className="row-between wrap" style={{ gap: 8 }}>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <Button
                        size="sm"
                        variant={showMinterms ? "primary" : "ghost"}
                        aria-pressed={showMinterms}
                        onClick={() => setShowMinterms((v) => !v)}
                      >
                        显示 m 编号
                      </Button>
                      <Button
                        size="sm"
                        variant={showGrayCode ? "primary" : "ghost"}
                        aria-pressed={showGrayCode}
                        onClick={() => setShowGrayCode((v) => !v)}
                      >
                        格雷码顺序
                      </Button>
                    </div>
                    <span className="tiny dim">
                      {mode === "edit"
                        ? "点击格子循环切换 0 → 1 → X"
                        : mode === "manual"
                        ? "点击格子加入/移出待确认分组"
                        : "点击格子可查看它被哪些分组覆盖"}
                    </span>
                  </div>

                  <KarnaughMap
                    layout={layout}
                    values={fn.values}
                    groups={displayGroups}
                    pending={mode === "manual" ? pending : []}
                    hovered={hovered}
                    onHover={setHovered}
                    onCellClick={handleCellClick}
                    showMinterms={showMinterms}
                    showGrayCode={showGrayCode}
                    interactive
                    highlight={mode === "auto" && inspected !== null ? [inspected] : []}
                    ariaLabel={`${n} 变量卡诺图`}
                  />

                  {displayGroups.length > 0 && (
                    <div className="kmap-legend">
                      {displayGroups.map((group) => (
                        <span className="legend-item" key={group.id}>
                          <span
                            className="legend-swatch"
                            style={{ background: groupColor(group.colorIndex) }}
                          />
                          {group.label}
                          <span className="dim">m({group.cells.join(",")})</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {hovered !== null && layout && (
                    <div className="callout callout--plain" style={{ padding: "6px 10px" }}>
                      <span className="mono small">
                        m{hovered} · {layout.variables.map((v, i) => {
                          const bit = (hovered >> (n - 1 - i)) & 1;
                          return `${v}=${bit}`;
                        }).join(", ")}{" "}
                        · F={fn.values[hovered]}
                      </span>
                      {inspectedGroups.length > 0 && (
                        <span className="tiny dim">
                          属于 {inspectedGroups.map((g) => g.label ?? "").join("、")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <Callout tone="warn">
                  <strong>当前函数有 {n} 个变量，无法绘制卡诺图。</strong>
                  <br />
                  卡诺图支持 2–6 变量：5 变量画成两页 4×4（E=0 / E=1），6 变量画成四页
                  （EF 按格雷码 00 / 01 / 11 / 10 排列）。再多变量纸面上已经看不过来了，
                  应改用合并表。请回到逻辑工作台把变量降到 6 个以内。
                  当前 {n} 个变量，化简结果仍然可用。
                  {sop && (
                    <>
                      <br />
                      化简结果仍然可用：<code>{sop.expression}</code>
                    </>
                  )}
                </Callout>
              )}
            </Panel>

            <Panel
              title="化简结果"
              actions={
                <Segmented
                  value={resultMode}
                  onChange={(value) => setResultMode(value)}
                  label="化简形式"
                  options={[
                    { value: "sop", label: "SOP 与或式" },
                    { value: "pos", label: "POS 或与式" },
                  ]}
                />
              }
            >
              {sop && pos ? (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="formula formula--notation">
                    <span className="formula__lhs">F =</span>
                    {state.notationMode === "all" && resultAst ? (
                      <span className="formula__all">
                        {renderAllDisciplines(resultAst, state.notationStyle).map((r) => (
                          <span className="formula__allrow" key={r.mode}>
                            <span className="formula__alld">{DISCIPLINE_MAP[r.mode].short}</span>
                            <NotationFormula value={r.nodes} size="sm" />
                          </span>
                        ))}
                      </span>
                    ) : resultAst ? (
                      <NotationFormula
                        value={renderNotation(resultAst, labelMode, state.notationStyle).nodes}
                        size="md"
                      />
                    ) : resultMode === "sop" ? (
                      sop.expression
                    ) : (
                      pos.expression
                    )}
                  </div>
                  <div className="row-between wrap" style={{ gap: 8 }}>
                    <span className="tiny dim">当前记法：{DISCIPLINE_MAP[labelMode].zh} · {labelStyle === "textbook" ? "教材" : "简写"}</span>
                    <NotationSwitcher />
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <Badge tone="mute">
                      {resultMode === "sop" ? `${sop.termCount} 项` : `${pos.clauseCount} 个和项`}
                    </Badge>
                    <Badge tone="mute">
                      {resultMode === "sop" ? `${sop.literalCount} 个文字` : `${pos.literalCount} 个文字`}
                    </Badge>
                    {literalsBefore !== null && (
                      <Badge tone={literalsAfter <= literalsBefore ? "ok" : "warn"}>
                        原式 {literalsBefore} 文字 → 化简 {literalsAfter} 文字
                      </Badge>
                    )}
                    {resultMode === "sop" ? (
                      <Badge tone={sop.essentialCount > 0 ? "accent" : "mute"}>
                        {sop.essentialCount} 个必需项
                      </Badge>
                    ) : null}
                  </div>

                  <Callout
                    tone={resultMode === "sop" ? (sopValidation?.ok ? "ok" : "danger") : posValidation?.ok ? "ok" : "danger"}
                    icon={<ShieldCheck size={14} />}
                  >
                    {resultMode === "sop" ? sopValidation?.message : posValidation?.message}
                  </Callout>

                  {resultMode === "sop" && sop.alternatives.length > 0 && (
                    <details>
                      <summary className="small muted" style={{ cursor: "pointer" }}>
                        还有 {sop.alternatives.length} 个同样简洁的等价解
                      </summary>
                      <div className="stack" style={{ gap: 5, marginTop: 6 }}>
                        {sop.alternatives.map((alt, i) => (
                          <div className="formula" key={i}>
                            F = {alt.expression}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  <div className="stat-grid">
                    <Stat label="1 的格子" value={ones} />
                    <Stat label="分组数" value={resultMode === "sop" ? sop.termCount : pos.clauseCount} />
                    <Stat label="无关项" value={dontCareList(fn).length} />
                  </div>
                </div>
              ) : (
                <Callout tone="plain">当前是常量函数，没有需要化简的项。</Callout>
              )}
            </Panel>
          </div>

          <div className="stack" style={{ gap: 14 }}>
            <Panel
              title="输入方式"
              sub="三种写法，同一份函数模型"
              actions={<Badge tone="mute">统一模型</Badge>}
            >
              <Segmented
                block
                value={inputTab}
                onChange={(value) => setInputTab(value)}
                label="输入方式"
                options={[
                  { value: "expression", label: "表达式" },
                  { value: "minterms", label: "最小项" },
                  { value: "table", label: "真值表" },
                ]}
              />
              <div style={{ marginTop: 10 }}>
                {inputTab === "expression" && (
                  <ExpressionEditor
                    value={state.expressionDraft}
                    onChange={actions.setDraft}
                    error={error}
                    variables={fn.variables}
                    mintermCount={minterms.length}
                    dontCareCount={dontCareList(fn).length}
                    rows={fn.values.length}
                    history={[]}
                    onReset={actions.resetExperiment}
                    notation={state.notationMode}
                  />
                )}

                {inputTab === "minterms" && (
                  <div className="stack" style={{ gap: 9 }}>
                    <div>
                      <div className="field__label" style={{ marginBottom: 4 }}>
                        变量数
                      </div>
                      <Segmented
                        block
                        value={String(varCount)}
                        onChange={(v) => setVarCount(Number(v))}
                        label="变量数"
                        options={[
                          { value: "2", label: "2" },
                          { value: "3", label: "3" },
                          { value: "4", label: "4" },
                          { value: "5", label: "5" },
                          { value: "6", label: "6" },
                        ]}
                      />
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="mint-input">
                        最小项 Σm
                      </label>
                      <input
                        id="mint-input"
                        className={`input input--mono ${mintError ? "input--error" : ""}`}
                        value={mintText}
                        placeholder="例如 1, 3, 5, 7"
                        onChange={(event) => setMintText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") applyMinterms();
                        }}
                      />
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="dc-input">
                        无关项 Σd <span className="dim">（可留空）</span>
                      </label>
                      <input
                        id="dc-input"
                        className="input input--mono"
                        value={dcText}
                        placeholder="例如 2, 6"
                        onChange={(event) => setDcText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") applyMinterms();
                        }}
                      />
                    </div>
                    {mintError && <div className="field__error">{mintError}</div>}
                    <Button variant="primary" onClick={applyMinterms} block>
                      生成函数
                    </Button>
                    <div className="tiny dim">
                      编号约定：A 为最高位。3 变量时 m5 = 101 → A=1, B=0, C=1。
                    </div>
                  </div>
                )}

                {inputTab === "table" && (
                  <div className="stack" style={{ gap: 8 }}>
                    <TruthTable
                      fn={fn}
                      selectedRow={hovered}
                      onSelectRow={(index) => setHovered(index)}
                      editable
                      onCycle={(index) => actions.setCell(index, cycleValue(fn.values[index]))}
                      maxHeight={300}
                    />
                    <div className="tiny dim">
                      点击输出值循环切换 0 → 1 → X。改动会立刻反映到卡诺图与化简结果。
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <Panel
              title="手动分组"
              sub={mode === "manual" ? `${pending.length} 格待确认` : "切换到手动模式后可操作"}
              actions={
                <div className="row" style={{ gap: 4 }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Undo2 size={12} />}
                    onClick={actions.undoManual}
                    disabled={!canUndo}
                    title="撤销上一步分组"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Redo2 size={12} />}
                    onClick={actions.redoManual}
                    disabled={!canRedo}
                    title="重做"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Eraser size={12} />}
                    onClick={() => {
                      actions.clearManual();
                      setPending([]);
                    }}
                    disabled={state.manual.groups.length === 0}
                    title="清空全部分组"
                  />
                </div>
              }
            >
              <div className="stack" style={{ gap: 9 }}>
                {mode !== "manual" ? (
                  <Callout tone="plain">
                    自动分组由精确覆盖算法给出，保证是全局最优。若想自己圈一组，切换到「手动分组」。
                  </Callout>
                ) : (
                  <>
                    <div className="row-between">
                      <span className="small muted">已选 {pending.length} 格</span>
                      <Button size="sm" variant="ghost" onClick={() => setPending([])} disabled={pending.length === 0}>
                        清空选择
                      </Button>
                    </div>

                    {pending.length > 0 && (
                      <div className={`callout ${pendingCheck?.ok ? "callout--ok" : "callout--danger"}`}>
                        {pendingCheck?.ok && pendingCheck.cube ? (
                          <>
                            <Check size={14} />
                            <div>
                              合法分组：<code>{termLabel(pendingCheck.cube.literals)}</code>
                              <div className="tiny dim">
                                覆盖 m({pendingCheck.cube.cells.join(",")}) · {pendingCheck.cube.size} 格
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={14} />
                            <div>{pendingCheck?.reason ?? "请选择格子"}</div>
                          </>
                        )}
                      </div>
                    )}

                    <Button
                      variant="primary"
                      block
                      icon={<Plus size={13} />}
                      onClick={addGroup}
                      disabled={!pendingCheck?.ok}
                    >
                      添加这个分组
                    </Button>
                  </>
                )}

                {manualViews.length > 0 && (
                  <div className="stack" style={{ gap: 5 }}>
                    <div className="row-between">
                      <span className="field__label">已添加的手动分组</span>
                      <Badge tone={uncoveredOnes.length === 0 ? "ok" : "warn"}>
                        {uncoveredOnes.length === 0 ? "覆盖完整" : `还差 ${uncoveredOnes.length} 个 1`}
                      </Badge>
                    </div>
                    {manualViews.map((view) => (
                      <div className="group-row" key={view.group.id}>
                        <span
                          className="group-row__dot"
                          style={{ background: view.valid ? groupColor(view.colorIndex) : "var(--danger)" }}
                        />
                        <div className="group-row__main">
                          <div className="group-row__term">
                            {view.check.cube ? termLabel(view.check.cube.literals) : "无效分组"}
                          </div>
                          <div className="group-row__meta">
                            m({view.group.cells.join(",")})
                            {!view.valid && ` · ${view.error}`}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => actions.removeManualGroup(view.group.id)}
                          aria-label="删除这个分组"
                        >
                          删除
                        </Button>
                      </div>
                    ))}
                    {uncoveredOnes.length > 0 && (
                      <div className="tiny" style={{ color: "var(--warn)" }}>
                        未覆盖的 1：m({uncoveredOnes.join(",")})
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>

        <DerivationPanel
          variables={fn.variables}
          values={fn.values}
          form={resultMode}
          chosen={resultMode === "sop" ? sop?.terms ?? [] : pos?.clauses.map((c) => c.cube) ?? []}
          expression={resultMode === "sop" ? sop?.expression ?? "0" : pos?.expression ?? "0"}
        />

        {sop && pos && (
          <HazardPanel
            variables={fn.variables}
            values={fn.values}
            sopTerms={sop.terms}
            posCubes={pos.clauses.map((clause) => clause.cube)}
          />
        )}
      </main>

      <aside className="inspector" aria-label="分组解释">
        <Panel
          title="分组明细"
          sub={resultMode === "sop" ? "SOP" : "POS"}
          actions={<Badge tone="mute">{displayGroups.length} 组</Badge>}
        >
          {displayGroups.length === 0 ? (
            <div className="empty">当前模式下没有可解释的分组</div>
          ) : (
            <div className="group-list">
              {displayGroups.map((group) => {
                const cube =
                  mode === "manual"
                    ? manualViews.find((v) => v.group.id === group.id)?.check.cube ?? null
                    : resultMode === "sop"
                    ? sop?.terms.find((t) => t.cells.join(",") === group.cells.join(",")) ?? null
                    : pos?.clauses.find((c) => c.cube.cells.join(",") === group.cells.join(","))?.cube ??
                      null;
                const explanation = cube ? explainGroup(cube, fn.variables) : null;
                return (
                  <div className="group-row" key={group.id}>
                    <span
                      className="group-row__dot"
                      style={{ background: groupColor(group.colorIndex) }}
                    />
                    <div className="group-row__main">
                      <div className="group-row__term">
                        {resultMode === "pos" && mode !== "manual"
                          ? group.label
                          : cube
                          ? termLabel(cube.literals)
                          : "—"}
                      </div>
                      <div className="group-row__meta">
                        m({group.cells.join(",")}) · {group.cells.length} 格
                      </div>
                      {explanation && (
                        <div className="group-row__meta" style={{ marginTop: 3 }}>
                          {explanation.text}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {inspected !== null && (
          <Panel
            title={`m${inspected}`}
            actions={
              <Badge tone={fn.values[inspected] === 1 ? "ok" : fn.values[inspected] === "X" ? "warn" : "mute"}>
                F = {fn.values[inspected]}
              </Badge>
            }
          >
            <div className="small muted" style={{ marginBottom: 6 }}>
              {fn.variables.map((v, i) => `${v}=${(inspected >> (n - 1 - i)) & 1}`).join("，")}
            </div>
            {inspectedGroups.length > 0 ? (
              <div className="stack" style={{ gap: 4 }}>
                <span className="field__label">被这些分组覆盖</span>
                {inspectedGroups.map((g) => (
                  <div className="row" key={g.id} style={{ gap: 6 }}>
                    <span className="legend-swatch" style={{ background: groupColor(g.colorIndex) }} />
                    <code className="small">{g.label}</code>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tiny dim">没有被任何分组覆盖。</div>
            )}
          </Panel>
        )}

        <Panel title="求解说明" actions={<ArrowLeftRight size={14} style={{ color: "var(--text-mute)" }} />}>
          <ol className="stack" style={{ gap: 7 }}>
            {(sop?.notes ?? []).map((note, i) => (
              <li key={i} className="small muted" style={{ lineHeight: 1.6 }}>
                · {note}
              </li>
            ))}
            <li className="small muted" style={{ lineHeight: 1.6 }}>
              · 每个分组保留「组内取值不变」的变量，消去「组内取值变化」的变量。
            </li>
            <li className="small muted" style={{ lineHeight: 1.6 }}>
              · 想逐步验算？主区域下方的「化简推导」把每一轮合并都列了出来。
            </li>
          </ol>
        </Panel>

        <Panel title="规则速查">
          <ul className="stack" style={{ gap: 6 }}>
            {[
              "分组大小只能是 2 的整数次幂（1、2、4、8、16、32、64）",
              "组内格子必须两两相邻（只差一个变量）",
              "左右边界、上下边界可以环绕相邻",
              "四个角可以合成一个 4 格分组",
              "对角线不算相邻",
              "X 可以参与分组，但不是必须覆盖",
              "允许分组重叠，以覆盖全部 1 为目标",
            ].map((rule) => (
              <li key={rule} className="tiny muted" style={{ lineHeight: 1.6 }}>
                · {rule}
              </li>
            ))}
          </ul>
        </Panel>
      </aside>
    </>
  );
}

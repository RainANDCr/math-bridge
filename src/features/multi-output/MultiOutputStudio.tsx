import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Button, Callout, Panel, Segmented, Stat } from "../../components/common";
import { KarnaughMap, groupColor } from "../../components/math/KarnaughMap";
import { ALL_VARIABLES, type CellValue } from "../../core/boolean/model";
import { parseIndexList } from "../../core/boolean/mintermInput";
import { buildKMapLayout } from "../../core/karnaugh/mapping";
import { minimizeMultiOutput, type OutputSpec } from "../../core/karnaugh/multiOutput";
import { factorMultiOutput } from "../../core/karnaugh/factoring";
import { FactorCostPanel, FactorDefinitionList, FactorNotePanel } from "./FactoringPanel";

/**
 * 多输出共享化简工作台
 *
 * 输入：同一组变量的若干输出函数（每个用 Σm / Σd 描述）。
 * 输出：一组乘积项，其中有的项同时喂给多个输出 —— 这些项在两幅卡诺图上同色。
 */

interface Draft {
  name: string;
  mint: string;
  dc: string;
}

const STORAGE_KEY = "mathbridge.multi.v2";
const MAX_OUTPUTS = 4;

const DEFAULT_STATE: { varCount: number; drafts: Draft[] } = {
  varCount: 3,
  drafts: [
    { name: "F1", mint: "1, 3, 5, 6, 7", dc: "" },
    { name: "F2", mint: "0, 2, 4, 6, 7", dc: "" },
  ],
};

const PRESETS: Array<{
  label: string;
  desc: string;
  varCount: number;
  drafts: Draft[];
  view?: "terms" | "factors";
}> = [
  {
    label: "共享 A·B",
    desc: "F1 = A·B + C，F2 = A·B + ¬C，共享项 A·B",
    varCount: 3,
    drafts: [
      { name: "F1", mint: "1, 3, 5, 6, 7", dc: "" },
      { name: "F2", mint: "0, 2, 4, 6, 7", dc: "" },
    ],
  },
  {
    label: "两位译码 a/b",
    desc: "两位二进制数译码：a 段与 b 段共享部分乘积项",
    varCount: 2,
    drafts: [
      { name: "a", mint: "0, 2, 3", dc: "" },
      { name: "b", mint: "0, 1, 2", dc: "" },
    ],
  },
  {
    label: "公共因子 A·B",
    desc: "F1 = A·B·C + A·B·D，F2 = A·B：把 A·B 单独造成一个门供 F1 复用",
    varCount: 4,
    view: "factors",
    drafts: [
      { name: "F1", mint: "13, 14, 15", dc: "" },
      { name: "F2", mint: "12, 13, 14, 15", dc: "" },
    ],
  },
  {
    label: "带无关项",
    desc: "F1 = Σm(0,1,4) + Σd(5)，F2 = Σm(0,1,2) + Σd(3)",
    varCount: 3,
    drafts: [
      { name: "F1", mint: "0, 1, 4", dc: "5" },
      { name: "F2", mint: "0, 1, 2", dc: "3" },
    ],
  },
];

function loadState(): { varCount: number; drafts: Draft[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as { varCount?: unknown; drafts?: unknown };
    if (!Array.isArray(parsed.drafts)) return DEFAULT_STATE;
    const varCount = Number(parsed.varCount);
    if (![2, 3, 4].includes(varCount)) return DEFAULT_STATE;
    const drafts = parsed.drafts
      .slice(0, MAX_OUTPUTS)
      .map((item, index) => {
        const record = item as Partial<Draft>;
        return {
          name: typeof record.name === "string" && record.name.trim() ? record.name : `F${index + 1}`,
          mint: typeof record.mint === "string" ? record.mint : "",
          dc: typeof record.dc === "string" ? record.dc : "",
        };
      });
    if (drafts.length < 1) return DEFAULT_STATE;
    return { varCount, drafts };
  } catch {
    return DEFAULT_STATE;
  }
}

export function MultiOutputStudio() {
  const [initial] = useState(loadState);
  const [varCount, setVarCount] = useState(initial.varCount);
  const [drafts, setDrafts] = useState<Draft[]>(initial.drafts);
  const [view, setView] = useState<"terms" | "factors">("terms");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ varCount, drafts }));
    } catch {
      /* 本地存储不可用时静默降级 */
    }
  }, [varCount, drafts]);

  const variables = useMemo(() => ALL_VARIABLES.slice(0, varCount), [varCount]);

  const parsed = useMemo(() => {
    const total = 1 << varCount;
    const specs: OutputSpec[] = [];
    const errors: Array<string | null> = [];

    for (const draft of drafts) {
      const mint = parseIndexList(draft.mint);
      const dc = parseIndexList(draft.dc);
      const values = new Array<CellValue>(total).fill(0);

      if (!mint.ok) {
        errors.push(mint.error);
        specs.push({ name: draft.name, values });
        continue;
      }
      if (!dc.ok) {
        errors.push(dc.error);
        specs.push({ name: draft.name, values });
        continue;
      }

      const bad = [...mint.values, ...dc.values].find((v) => v >= total);
      if (bad !== undefined) {
        errors.push(`编号 ${bad} 超出 ${varCount} 变量范围 0–${total - 1}`);
        specs.push({ name: draft.name, values });
        continue;
      }
      const overlap = mint.values.find((v) => dc.values.includes(v));
      if (overlap !== undefined) {
        errors.push(`m${overlap} 同时被写进最小项和无关项，请去掉一个`);
        specs.push({ name: draft.name, values });
        continue;
      }

      mint.values.forEach((v) => {
        values[v] = 1;
      });
      dc.values.forEach((v) => {
        values[v] = "X";
      });
      specs.push({ name: draft.name, values });
      errors.push(null);
    }

    return { specs, errors, invalid: errors.some(Boolean) };
  }, [drafts, varCount]);

  const result = useMemo(
    () => minimizeMultiOutput(variables, parsed.specs),
    [variables, parsed.specs]
  );

  const layout = useMemo(() => buildKMapLayout(variables), [variables]);

  // 因式分解建立在「共享化简」的结果之上：先有那组乘积项，再找它们的公共因子
  const factored = useMemo(
    () => (parsed.invalid ? null : factorMultiOutput(variables, result)),
    [variables, result, parsed.invalid]
  );
  const factors = view === "factors" && factored;

  const update = (index: number, patch: Partial<Draft>) => {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft))
    );
  };

  const addOutput = () => {
    if (drafts.length >= MAX_OUTPUTS) return;
    setDrafts((current) => [
      ...current,
      { name: `F${current.length + 1}`, mint: "", dc: "" },
    ]);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setVarCount(preset.varCount);
    setDrafts(preset.drafts.map((draft) => ({ ...draft })));
    if (preset.view) setView(preset.view);
  };

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>一份电路，多个输出</h2>
            <p>
              几个输出共用同一组输入时，<strong>同一个乘积项只需要造一次</strong>。
              各输出单独化简往往不是总成本最低的方案 —— 这里先找一组共享的乘积项，
              再往下找它们的公共因子：共享粒度从「整项」降到「子表达式」。
            </p>
          </div>
          <div className="page-head__actions">
            <Segmented
              value={view}
              onChange={(value) => setView(value as "terms" | "factors")}
              label="共享粒度"
              options={[
                { value: "terms", label: "乘积项" },
                { value: "factors", label: "子表达式" },
              ]}
            />
            {factors ? (
              <Badge tone={factored && factored.factoredCost < factored.twoLevelCost ? "ok" : "mute"}>
                {factored && factored.factoredCost < factored.twoLevelCost
                  ? `省 ${factored.twoLevelCost - factored.factoredCost}`
                  : "无公共因子"}
              </Badge>
            ) : (
              <Badge tone="accent">{result.sharedTerms} 个共享项</Badge>
            )}
          </div>
        </div>

        <div className="split-main">
          <div className="stack" style={{ gap: 14 }}>
            <Panel
              title="输出函数"
              sub={`共享变量 ${variables.join(", ")}`}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus size={12} />}
                  onClick={addOutput}
                  disabled={drafts.length >= MAX_OUTPUTS}
                >
                  加一个输出
                </Button>
              }
            >
              <div className="stack" style={{ gap: 12 }}>
                <div>
                  <div className="field__label" style={{ marginBottom: 4 }}>
                    变量数
                  </div>
                  <Segmented
                    block
                    value={String(varCount)}
                    onChange={(value) => setVarCount(Number(value))}
                    label="变量数"
                    options={[
                      { value: "2", label: "2" },
                      { value: "3", label: "3" },
                      { value: "4", label: "4" },
                    ]}
                  />
                </div>

                {drafts.map((draft, index) => (
                  <div className="multi-row" key={index}>
                    <div className="multi-row__head">
                      <input
                        className="input multi-row__name"
                        value={draft.name}
                        aria-label={`第 ${index + 1} 个输出的名称`}
                        onChange={(event) => update(index, { name: event.target.value })}
                      />
                      <Badge tone={parsed.errors[index] ? "danger" : "mute"}>
                        {1 << varCount} 种取值
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`删除输出 ${draft.name}`}
                        onClick={() =>
                          setDrafts((current) => current.filter((_, i) => i !== index))
                        }
                        disabled={drafts.length <= 2}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                    <div className="multi-row__fields">
                      <label className="field">
                        <span className="field__label">最小项 Σm</span>
                        <input
                          className="input input--mono"
                          value={draft.mint}
                          placeholder="例如 1, 3, 5"
                          onChange={(event) => update(index, { mint: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">无关项 Σd</span>
                        <input
                          className="input input--mono"
                          value={draft.dc}
                          placeholder="可留空"
                          onChange={(event) => update(index, { dc: event.target.value })}
                        />
                      </label>
                    </div>
                    {parsed.errors[index] && (
                      <div className="field__error">{parsed.errors[index]}</div>
                    )}
                  </div>
                ))}

                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="tiny dim">示例：</span>
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant="ghost"
                      title={preset.desc}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw size={11} />}
                    onClick={() => {
                      setVarCount(DEFAULT_STATE.varCount);
                      setDrafts(DEFAULT_STATE.drafts.map((d) => ({ ...d })));
                    }}
                  >
                    恢复默认
                  </Button>
                </div>
              </div>
            </Panel>

            {factors ? (
              <FactorDefinitionList factored={factors} outputNames={result.perOutput.map((o) => o.name)} />
            ) : (
            <Panel
              title="共享结果"
              sub="同一行 = 一个乘积项，它的颜色在两幅卡诺图里通用"
              actions={<Badge tone="mute">{result.totalTerms} 项</Badge>}
            >
              {parsed.invalid ? (
                <Callout tone="danger">先修正上面的输入错误，这里才有结果。</Callout>
              ) : result.terms.length === 0 ? (
                <Callout tone="plain">所有输出都是 0，不需要任何乘积项。</Callout>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {result.terms.map((term, index) => (
                    <div className="multi-term" key={`${term.cube.base}/${term.cube.mask}`}>
                      <span
                        className="legend-swatch"
                        style={{ background: groupColor(index) }}
                      />
                      <code className="multi-term__expr">{term.expression}</code>
                      <span className="tiny dim">{term.cube.literals.length} 文字</span>
                      <div className="multi-term__outputs">
                        {term.outputs.map((o) => (
                          <Badge key={o} tone={term.outputs.length > 1 ? "ok" : "mute"}>
                            {result.perOutput[o].name}
                          </Badge>
                        ))}
                      </div>
                      <span className="multi-term__cells">
                        m({term.cube.cells.join(",")})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            )}
          </div>

          <div className="stack" style={{ gap: 14 }}>
            {factors ? (
              <>
                <FactorCostPanel factored={factors} />
                <FactorNotePanel factored={factors} />
              </>
            ) : (
            <>
            <Panel title="每个输出的表达式" sub="只用属于它的乘积项">
              <div className="stack" style={{ gap: 8 }}>
                {result.perOutput.map((output, index) => (
                  <div key={index}>
                    <div className="row-between">
                      <span className="field__label">{output.name}</span>
                      <span className="tiny dim">
                        {output.terms} 项 · {output.literals} 文字
                      </span>
                    </div>
                    <div className="formula" style={{ marginTop: 3 }}>
                      {output.name} = {output.expression}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="代价对比" actions={<Badge tone="mute">文字数</Badge>}>
              <div className="stack" style={{ gap: 10 }}>
                <div className="compare-row">
                  <span className="small muted">各自独立化简</span>
                  <span className="mono">{result.independent.literals}</span>
                  <span className="tiny dim">文字 · {result.independent.terms} 项</span>
                </div>
                <div className="compare-row is-best">
                  <span className="small">共享化简</span>
                  <span className="mono">{result.totalLiterals}</span>
                  <span className="tiny dim">文字 · {result.totalTerms} 项</span>
                </div>
                <div className="compare-bar">
                  <div
                    className="compare-bar__fill"
                    style={{
                      width: `${
                        result.independent.literals === 0
                          ? 0
                          : Math.round(
                              (result.totalLiterals / Math.max(1, result.independent.literals)) * 100
                            )
                      }%`,
                    }}
                  />
                </div>
                <div className="small muted">
                  {result.savings > 0
                    ? `共享后少用 ${result.savings} 个文字、${
                        result.independent.terms - result.totalTerms
                      } 个乘积项。`
                    : "这组函数没有可共享的乘积项，两种做法一样贵。"}
                </div>
                <div className="stat-grid">
                  <Stat label="共享项" value={result.sharedTerms} />
                  <Stat label="总项数" value={result.totalTerms} />
                  <Stat label="总文字" value={result.totalLiterals} />
                </div>
              </div>
            </Panel>
            </>
            )}
          </div>
        </div>

        <Panel
          title="每个输出的卡诺图"
          sub="同色的圈表示同一个共享乘积项"
          actions={<Badge tone="accent">共享可视化</Badge>}
        >
          {varCount >= 2 ? (
            <div className="multi-kmap-grid">
              {parsed.specs.map((spec, o) => {
                const groups = result.terms
                  .map((term, index) => ({ term, index }))
                  .filter(({ term }) => term.outputs.includes(o))
                  .map(({ term, index }) => ({
                    id: `o${o}-t${index}`,
                    cells: term.cube.cells,
                    colorIndex: index,
                    kind: "auto" as const,
                    label: term.expression,
                  }));
                return (
                  <div className="multi-kmap" key={o}>
                    <div className="multi-kmap__head">
                      <strong>{spec.name}</strong>
                      <code className="tiny">
                        {factors
                          ? factors.outputs[o]?.expression
                          : result.perOutput[o]?.expression}
                      </code>
                    </div>
                    <KarnaughMap
                      layout={layout}
                      values={spec.values}
                      groups={groups}
                      showMinterms={false}
                      interactive={false}
                      ariaLabel={`${spec.name} 的卡诺图`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <Callout tone="plain">卡诺图需要 2 个以上变量。</Callout>
          )}
        </Panel>
      </main>

      <aside className="inspector" aria-label="说明">
        <Panel title="为什么共享更省" actions={<Layers size={14} style={{ color: "var(--text-mute)" }} />}>
          <div className="stack" style={{ gap: 8 }}>
            <p className="small muted" style={{ lineHeight: 1.7 }}>
              乘积项由与门产生。若 <code>A·B</code> 同时出现在两个输出里，只需要一个与门，
              再把它的输出接到两个或门 —— 这就是共享。
            </p>
            <p className="small muted" style={{ lineHeight: 1.7 }}>
              代价按 <code>文字数 + 1</code> 计：文字数决定与门输入数，+1 代表这个乘积项本身。
              共享项只计一次。
            </p>
            <Callout tone="plain">
              单看某一个输出，共享解可能比它自己的最简式更差；但总成本更低。
              这正是「局部最优 ≠ 全局最优」。
            </Callout>
          </div>
        </Panel>

        <Panel title="算法说明">
          <ol className="stack" style={{ gap: 6 }}>
            {[
              "枚举所有对至少一个输出合法的立方体（3ⁿ 个）",
              "每个立方体算出它能覆盖的 (输出, 最小项) 对",
              "剔除被支配的立方体：覆盖是别人的子集且成本不更低",
              "分支限界选一组立方体覆盖全部对，最小化 Σ(文字数+1)",
            ].map((line) => (
              <li key={line} className="tiny muted" style={{ lineHeight: 1.6 }}>
                · {line}
              </li>
            ))}
          </ol>
          <div className="tiny dim" style={{ marginTop: 8, lineHeight: 1.6 }}>
            {result.notes.join("；")}
          </div>
        </Panel>

        <Panel title="看这组数">
          <div className="tiny muted" style={{ lineHeight: 1.7 }}>
            上例中 <code>A·B</code> 被两个输出共用：独立化简要造两个与门，共享后只需一个。
            把 F2 的无关项改一改，看共享项什么时候消失 —— 那说明共享的前提是
            <strong>两个输出在同一块区域都为 1</strong>。
          </div>
        </Panel>
      </aside>
    </>
  );
}

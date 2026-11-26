import { useMemo, useState } from "react";
import { ArrowRight, ExternalLink, Link2 } from "lucide-react";
import { useApp, probabilityArray } from "../../store/appStore";
import { Badge, Button, Callout, Panel } from "../../components/common";
import { TruthTable } from "../../components/math/TruthTable";
import { KarnaughMap, groupColor } from "../../components/math/KarnaughMap";
import { termToString } from "../../core/karnaugh/implicants";
import { CircuitDiagram } from "../../components/math/CircuitDiagram";
import { buildKMapLayout } from "../../core/karnaugh/mapping";
import { minimizePosValues, minimizeValues } from "../../core/karnaugh/minimizer";
import { validateSop } from "../../core/karnaugh/validation";
import { buildCircuit } from "../../core/circuit/model";
import { layoutCircuit } from "../../core/circuit/layout";
import { sopToAst } from "../../core/karnaugh/sopAst";
import { theoreticalProbability } from "../../core/probability/theoretical";
import { MAX_KARNAUGH_VARIABLES, mintermNotation } from "../../core/boolean/model";
import {
  CONCEPTS,
  conceptById,
  relationsOf,
  type Concept,
  type Domain,
} from "../../core/knowledge/concepts";

const DOMAIN_ORDER: Array<Domain | "公共"> = ["离散数学", "概率论", "数字电路", "公共"];

const BRIDGE_ROWS: Array<{ d: string; p: string; c: string; concept: string }> = [
  { d: "命题与逻辑运算", p: "事件与事件运算", c: "逻辑门与逻辑函数", concept: "proposition" },
  { d: "逻辑合取  ∧", p: "事件交集  ∩", c: "AND 与门", concept: "conjunction" },
  { d: "逻辑析取  ∨", p: "事件并集  ∪", c: "OR 或门", concept: "disjunction" },
  { d: "逻辑否定  ¬", p: "事件补集  ᶜ", c: "NOT 非门", concept: "negation" },
  { d: "真值表", p: "离散结果及其概率", c: "电路输入输出表", concept: "truth-table" },
  { d: "布尔代数化简", p: "集合运算恒等式", c: "逻辑函数化简", concept: "boolean-algebra" },
];

function BridgeDiagram({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  const rows = BRIDGE_ROWS.length;
  const rowH = 30;
  const top = 46;
  const height = top + rows * rowH + 8;
  const width = 660;
  const cx = [16, 234, 452];

  return (
    <svg
      className="bridge-map"
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label="三门课程的概念映射"
    >
      {[
        { x: cx[0], title: "离散数学", color: "var(--accent)" },
        { x: cx[1], title: "概率论", color: "var(--violet)" },
        { x: cx[2], title: "数字电路", color: "var(--g2)" },
      ].map((col) => (
        <text
          key={col.title}
          x={col.x}
          y={20}
          fill={col.color}
          fontSize={10}
          fontWeight={700}
          letterSpacing="0.14em"
        >
          {col.title}
        </text>
      ))}

      {BRIDGE_ROWS.map((row, i) => {
        const y = top + i * rowH;
        const isActive = active === row.concept;
        const texts = [row.d, row.p, row.c];
        return (
          <g
            key={row.concept + i}
            onClick={() => onSelect(row.concept)}
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            aria-label={`${row.d} 对应 ${row.p} 对应 ${row.c}`}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(row.concept);
            }}
          >
            <rect
              x={0}
              y={y - 13}
              width={width}
              height={rowH - 4}
              rx={5}
              fill={isActive ? "var(--accent-soft)" : "transparent"}
              stroke={isActive ? "var(--accent-line)" : "transparent"}
            />
            <line x1={cx[0] + 104} y1={y} x2={cx[1] - 8} y2={y} stroke="var(--line-strong)" strokeWidth={1} />
            <line x1={cx[1] + 104} y1={y} x2={cx[2] - 8} y2={y} stroke="var(--line-strong)" strokeWidth={1} />
            <circle cx={cx[0] + 104} cy={y} r={2} fill="var(--accent)" opacity={0.7} />
            <circle cx={cx[1] - 8} cy={y} r={2} fill="var(--violet)" opacity={0.7} />
            <circle cx={cx[1] + 104} cy={y} r={2} fill="var(--violet)" opacity={0.7} />
            <circle cx={cx[2] - 8} cy={y} r={2} fill="var(--g2)" opacity={0.7} />
            {texts.map((text, idx) => (
              <text
                key={idx}
                x={cx[idx]}
                y={y + 4}
                fontSize={11}
                fill={isActive ? "var(--text)" : "var(--text-dim)"}
                fontFamily="var(--font-sans)"
              >
                {text}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function ConceptDetail({ concept }: { concept: Concept }) {
  const related = relationsOf(concept.id);
  return (
    <div className="concept-detail">
      <h3>{concept.zh}</h3>
      <div className="concept-detail__en">
        {concept.en} · {concept.domain}
      </div>

      <div className="concept-section">
        <div className="concept-section__label">定义</div>
        <p>{concept.definition}</p>
      </div>

      <div className="concept-section">
        <div className="concept-section__label">形式化</div>
        <div className="formula">{concept.formula}</div>
      </div>

      <div className="concept-section">
        <div className="concept-section__label">直观理解</div>
        <p>{concept.intuition}</p>
      </div>

      <div className="concept-section">
        <div className="concept-section__label">在其他课程中</div>
        <div className="concept-cross">
          {concept.cross.map((item) => (
            <div className="concept-cross__row" key={item.domain + item.text}>
              <span className="concept-cross__tag">{item.domain}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="concept-section">
        <div className="concept-section__label">动手试试</div>
        <p>{concept.experiment}</p>
      </div>

      <div className="concept-section">
        <div className="concept-section__label">常见误区</div>
        <div className="stack" style={{ gap: 6 }}>
          {concept.misconceptions.map((item) => (
            <div className="misconception" key={item}>
              {item}
            </div>
          ))}
        </div>
      </div>

      {related.length > 0 && (
        <div className="concept-section">
          <div className="concept-section__label">相关概念</div>
          <div className="concept-chips">
            {related.map((relation) => {
              const other = conceptById(relation.from === concept.id ? relation.to : relation.from);
              if (!other) return null;
              return (
                <span className="concept-chip" key={relation.label}>
                  {other.zh}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConnectionLab() {
  const { state, actions } = useApp();
  const fn = state.fn;
  const [selected, setSelected] = useState<string>("karnaugh");
  // 六张卡片共享的「当前最小项」焦点。
  // 悬停是暂时的（移开就恢复），点击是钉住的（再点一次取消），两者分开存，
  // 否则鼠标一离开就把用户刚点的那一行清掉了。
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [pinnedRow, setPinnedRow] = useState<number | null>(null);
  const focusRow = hoverRow ?? pinnedRow;
  const togglePin = (minterm: number) =>
    setPinnedRow((current) => (current === minterm ? null : minterm));
  const concept = conceptById(selected) ?? CONCEPTS[0];

  const probs = useMemo(
    () => probabilityArray(fn.variables, state.probabilities),
    [fn.variables, state.probabilities]
  );
  const theory = useMemo(() => theoreticalProbability(fn, probs), [fn, probs]);
  const sop = useMemo(() => (fn.variables.length ? minimizeValues(fn.variables, fn.values) : null), [fn]);
  const pos = useMemo(() => (fn.variables.length ? minimizePosValues(fn.variables, fn.values) : null), [fn]);
  const validation = useMemo(() => (sop ? validateSop(fn, sop.terms) : null), [fn, sop]);

  const circuit = useMemo(() => {
    const ast = fn.ast ?? (sop ? sopToAst(sop.terms, fn.variables) : { kind: "const" as const, value: 0 });
    return buildCircuit(ast);
  }, [fn, sop]);
  const layout = useMemo(() => layoutCircuit(circuit), [circuit]);

  const focus = useMemo(() => {
    if (focusRow === null) return null;
    const assignment = fn.variables.map((variable, i) => ({
      variable,
      bit: ((focusRow >> (fn.variables.length - 1 - i)) & 1) as 0 | 1,
    }));
    const probability = assignment.reduce((acc, item, i) => {
      const p = probs[i] ?? 0.5;
      return acc * (item.bit === 1 ? p : 1 - p);
    }, 1);
    const groups = (sop?.terms ?? [])
      .map((term, index) => ({ term, index }))
      .filter(({ term }) => term.cells.includes(focusRow));
    return { minterm: focusRow, assignment, probability, groups, value: fn.values[focusRow] };
  }, [focusRow, fn, probs, sop]);

  const kmapLayout = useMemo(
    () =>
      fn.variables.length >= 2 && fn.variables.length <= MAX_KARNAUGH_VARIABLES
        ? buildKMapLayout(fn.variables)
        : null,
    [fn.variables]
  );

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>同一个数学对象，三种写法</h2>
            <p>
              下面所有卡片描述的都是当前函数{" "}
              <code className="mono">{fn.expression}</code>。改动其中任何一个输入，六张卡片会同时变化 ——
              这正是「它们本来就是同一件事」的证据。
            </p>
          </div>
          <div className="page-head__actions">
            <Badge tone="accent">实时联动</Badge>
            <Badge tone={validation?.ok ? "ok" : "mute"}>
              {validation?.ok ? "已验证一致" : "待验证"}
            </Badge>
          </div>
        </div>

        <Panel
          title="概念映射"
          sub="点击任意一行查看细节"
          actions={<Badge tone="mute">结构对应</Badge>}
        >
          <div className="bridge-map-wrap">
            <BridgeDiagram active={selected} onSelect={setSelected} />
          </div>
          <div className="tiny dim" style={{ marginTop: 4 }}>
            这些是数学结构上的对应：合取与交集都满足同一套分配律、德摩根律；但「独立性」是概率论特有的假设，
            不能从逻辑结构直接推出。
          </div>
        </Panel>

        <div className={`bridge-focus${focus ? " is-active" : ""}`}>
          {focus ? (
            <>
              <div className="bridge-focus__main">
                <span className="bridge-focus__m">m{focus.minterm}</span>
                <div className="bridge-focus__bits">
                  {focus.assignment.map((item) => (
                    <span className="bit-chip" key={item.variable}>
                      <span className="bit-chip__var">{item.variable}</span>
                      <span className={`bit-chip__val${item.bit === 1 ? " is-one" : ""}`}>
                        {item.bit}
                      </span>
                    </span>
                  ))}
                </div>
                <Badge tone={focus.value === 1 ? "ok" : focus.value === "X" ? "warn" : "mute"}>
                  F = {focus.value}
                </Badge>
                <span className="bridge-focus__prob mono">
                  P ={" "}
                  {focus.assignment
                    .map((item) => `P(${item.variable}=${item.bit})`)
                    .join(" · ")}{" "}
                  = {focus.probability.toFixed(4)}
                </span>
              </div>
              <div className="bridge-focus__groups">
                {focus.groups.length > 0 ? (
                  <>
                    <span className="tiny dim">被这些分组覆盖</span>
                    {focus.groups.map(({ term, index }) => (
                      <span className="focus-group" key={index}>
                        <span
                          className="legend-swatch"
                          style={{ background: groupColor(index) }}
                        />
                        <code>{termToString(term.literals)}</code>
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="tiny dim">
                    {focus.value === 1
                      ? "没有被任何分组覆盖 —— 这不该发生，化简结果覆盖不全"
                      : focus.value === "X"
                      ? "无关项：可以被分组利用，但不是必须覆盖"
                      : "该格为 0，不参与 SOP 分组"}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="small dim">
              把鼠标移到真值表任意一行，或点一下卡诺图格子 —— 两处会同时亮起同一个最小项，并算出这一行的概率。
            </span>
          )}
        </div>

        <div className="bridge-grid" style={{ marginTop: 14 }}>
          <div className="bridge-card">
            <div className="bridge-card__head">
              <span className="bridge-card__num">1</span> 逻辑表达式 · 离散数学
            </div>
            <div className="code-block">{fn.expression}</div>
            <div className="tiny dim">
              变量：{fn.variables.join(", ") || "无"} · 最小项记号 {mintermNotation(fn)}
            </div>
          </div>

          <div className="bridge-card">
            <div className="bridge-card__head">
              <span className="bridge-card__num">2</span> 命题逻辑解释
            </div>
            <div className="small muted" style={{ lineHeight: 1.7 }}>
              把每个变量读作一个命题（如 A = “下雨”，B = “堵车”，C = “迟到”），
              整个表达式就是这些命题的复合命题。它只在特定真值组合下为真。
            </div>
            <div className="formula">F 为真 ⇔ {sop?.expression ?? "—"}</div>
          </div>

          <div className="bridge-card">
            <div className="bridge-card__head">
              <span className="bridge-card__num">3</span> 真值表
            </div>
            <TruthTable
              fn={fn}
              selectedRow={focusRow}
              onSelectRow={togglePin}
              onHoverRow={setHoverRow}
              maxHeight={190}
            />
          </div>

          <div className="bridge-card">
            <div className="bridge-card__head">
              <span className="bridge-card__num">4</span> 逻辑电路 · 数字电路
            </div>
            <CircuitDiagram circuit={circuit} layout={layout} showLabels fit />
            <div className="tiny dim">按最简与或式实现，共 {circuit.nodes.length} 个门/输入节点</div>
          </div>

          <div className="bridge-card">
            <div className="bridge-card__head">
              <span className="bridge-card__num">5</span> 卡诺图与化简
            </div>
            {kmapLayout ? (
              <KarnaughMap
                layout={kmapLayout}
                values={fn.values}
                groups={(sop?.terms ?? []).map((term, i) => ({
                  id: `c-${i}`,
                  cells: term.cells,
                  colorIndex: i,
                  kind: "auto" as const,
                }))}
                hovered={hoverRow}
                onHover={setHoverRow}
                onCellClick={togglePin}
                highlight={focusRow !== null ? [focusRow] : []}
                showMinterms={false}
                interactive
              />
            ) : (
              <div className="tiny dim">当前函数不适合画卡诺图（需要 2–6 变量）。</div>
            )}
            <div className="formula" style={{ marginTop: 6 }}>
              SOP: {sop?.expression ?? "—"}
            </div>
            <div className="formula">POS: {pos?.expression ?? "—"}</div>
          </div>

          <div className="bridge-card">
            <div className="bridge-card__head">
              <span className="bridge-card__num">6</span> 概率 · 概率论
            </div>
            <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
              <span
                className="mono"
                style={{ fontSize: 28, fontWeight: 600, color: "var(--accent-strong)", lineHeight: 1 }}
              >
                {theory.p1.toFixed(4)}
              </span>
              <span className="small dim">P(F = 1)</span>
            </div>
            <div className="tiny dim" style={{ lineHeight: 1.6 }}>
              在输入独立、各自取 1 的概率为{" "}
              {fn.variables.map((v) => `${v}:${(state.probabilities[v] ?? 0.5).toFixed(2)}`).join("，") ||
                "—"}{" "}
              的假设下。
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<ExternalLink size={12} />}
              onClick={() => actions.setStudio("probability")}
              style={{ alignSelf: "flex-start" }}
            >
              去概率实验室跑模拟
            </Button>
          </div>

          <div className="bridge-card bridge-card--wide">
            <div className="bridge-card__head">
              <span className="bridge-card__num">7</span> 一致性检查
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Badge tone={validation?.ok ? "ok" : "danger"}>
                {validation?.ok ? "SOP 与真值表逐行一致" : "SOP 校验失败"}
              </Badge>
              <Badge tone="mute">共 {fn.values.length} 行</Badge>
              <Badge tone="mute">{sop?.termCount ?? 0} 个乘积项</Badge>
              <Badge tone="mute">{sop?.literalCount ?? 0} 个文字</Badge>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {validation?.message}
            </div>
            <Callout tone="plain" icon={<Link2 size={14} />}>
              左侧的表达式、上方的真值表、右侧的电路与卡诺图，都从同一个 <code>BooleanFunction</code>{" "}
              对象渲染而来，不存在「各画各的」的可能。
            </Callout>
          </div>
        </div>
      </main>

      <aside className="inspector" aria-label="概念说明">
        <Panel
          title="概念图谱"
          actions={
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowRight size={12} />}
              onClick={() => actions.setStudio("reference")}
            >
              全部
            </Button>
          }
        >
          <div className="concept-groups">
            {DOMAIN_ORDER.map((domain) => {
              const items = CONCEPTS.filter((c) => c.domain === domain);
              if (items.length === 0) return null;
              return (
                <div key={domain}>
                  <div className="concept-group__label">{domain}</div>
                  <div className="concept-chips">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`concept-chip ${selected === item.id ? "is-active" : ""}`}
                        aria-pressed={selected === item.id}
                        onClick={() => setSelected(item.id)}
                      >
                        {item.zh}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="概念详解">
          <ConceptDetail concept={concept} />
        </Panel>
      </aside>
    </>
  );
}

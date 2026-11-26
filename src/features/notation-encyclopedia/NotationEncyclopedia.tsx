import { useMemo, useState } from "react";
import { ArrowRight, Check, Search, TriangleAlert } from "lucide-react";
import { Badge, Button, Callout, Empty, Panel, Segmented } from "../../components/common";
import { GateSymbol } from "../../components/math/GateSymbol";
import { GateIcon } from "../../components/math/GateIcon";
import { NotationFormula } from "../../components/notation/NotationFormula";
import type { GateKind } from "../../core/logic-gates/gates";
import { gateTruth } from "../../core/logic-gates/gates";
import { parseExpression } from "../../core/boolean/parser";
import { collectVariables } from "../../core/boolean/ast";
import { evaluateAtIndex } from "../../core/boolean/evaluator";
import { describeInputNotices } from "../../core/notation/aliases";
import { renderNotation } from "../../core/notation/notationConversion";
import { DISCIPLINES, type Discipline } from "../../core/notation/notationTypes";
import {
  OPERATORS,
  operatorById,
  searchOperators,
  type NotationVariant,
  type OperatorEntry,
  type OperatorId,
} from "../../core/notation/notationRegistry";
import { useApp } from "../../store/appStore";
import { GateGallery, GateInspector } from "./GateGallery";

type Tab = "atlas" | "gates";

/** 一次解析尝试的结果，用于「输入识别器」 */
type ReaderResult =
  | {
      ok: true;
      ast: ReturnType<typeof parseExpression>["ast"];
      variables: string[];
      vector: string;
    }
  | { ok: false; message: string; hint: string; position: number };

function useReader(text: string): ReaderResult | null {
  return useMemo(() => {
    if (text.trim().length === 0) return null;
    try {
      const { ast } = parseExpression(text);
      const variables = collectVariables(ast).sort();
      const total = 1 << variables.length;
      let vector = "";
      for (let i = 0; i < total; i += 1) vector += evaluateAtIndex(ast, variables, i) ? "1" : "0";
      return { ok: true, ast, variables, vector };
    } catch (error) {
      const e = error as { message?: string; hint?: string; position?: number };
      return {
        ok: false,
        message: e.message ?? "无法解析",
        hint: e.hint ?? "",
        position: e.position ?? 0,
      };
    }
  }, [text]);
}

/** 教材写法里的上划线必须走排版组件，不能靠字符串里的特殊字符 */
function VariantFormula({ variant }: { variant: NotationVariant }) {
  return (
    <span className="nota nota--sm">
      {variant.barred ? <span className="nota__bar">{variant.primary}</span> : variant.primary}
    </span>
  );
}

function DisciplineChips({
  value,
  onChange,
}: {
  value: Discipline | "all";
  onChange: (value: Discipline | "all") => void;
}) {
  const options: Array<{ id: Discipline | "all"; label: string }> = [
    { id: "all", label: "全部" },
    ...DISCIPLINES.map((d) => ({ id: d.id as Discipline | "all", label: d.zh })),
  ];
  return (
    <div className="nota-chips" role="group" aria-label="按学科筛选">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`nota-chip ${value === option.id ? "is-active" : ""}`}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function OperatorCard({
  entry,
  active,
  onSelect,
}: {
  entry: OperatorEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const glyph = entry.glyph;
  return (
    <button
      type="button"
      className={`op-card ${active ? "is-active" : ""}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <div className="op-card__head">
        <span className={`op-card__glyph ${glyph.length > 1 ? "op-card__glyph--wide" : ""}`}>{glyph}</span>
        <span className="op-card__names">
          <strong>{entry.zh}</strong>
          <span>{entry.en}</span>
        </span>
        <GateIcon kind={entry.gate} width={48} height={32} />
      </div>
      <dl className="op-card__forms">
        {DISCIPLINES.map((d) => {
          const variant = entry.variants[d.id];
          return (
            <div className="op-card__row" key={d.id}>
              <dt>{d.short}</dt>
              <dd className={variant ? "" : "is-none"}>
                {variant ? <VariantFormula variant={variant} /> : "无直接对应"}
              </dd>
            </div>
          );
        })}
      </dl>
    </button>
  );
}

function SymbolButtons({ entry }: { entry: OperatorEntry }) {
  const { actions } = useApp();
  if (entry.symbols.length === 0) return null;
  return (
    <div className="symbol-row">
      {entry.symbols.map((symbol) => (
        <button
          key={symbol}
          type="button"
          className="symbol-btn"
          title={`复制 ${symbol}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(symbol);
              actions.notify("ok", `已复制符号 ${symbol}`);
            } catch {
              actions.notify("error", "浏览器拒绝访问剪贴板");
            }
          }}
        >
          {symbol}
        </button>
      ))}
      <span className="tiny dim">点击复制</span>
    </div>
  );
}

export function NotationEncyclopedia() {
  const { actions } = useApp();
  const [tab, setTab] = useState<Tab>("atlas");
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "all">("all");
  const [selected, setSelected] = useState<OperatorId>("and");
  const [gateKind, setGateKind] = useState<GateKind>("AND");
  const [readerText, setReaderText] = useState("A NAND B");

  const entry = operatorById(selected);
  const results = useMemo(() => searchOperators(query, discipline), [query, discipline]);
  const reader = useReader(readerText);
  const notices = useMemo(() => describeInputNotices(readerText), [readerText]);

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>跨学科符号百科</h2>
            <p>
              同一个结构，在命题逻辑、门电路、布尔代数、集合与事件里有各自的写法。
              这里把「怎么写、为什么这样写、哪里不能互换」放在一起查。
            </p>
          </div>
          <div className="page-head__actions">
            <Badge tone="accent">{OPERATORS.length} 个运算</Badge>
            <Badge tone="mute">5 个学科</Badge>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <Segmented
            value={tab}
            onChange={(value) => setTab(value)}
            label="符号百科分区"
            options={[
              { value: "atlas", label: "符号速查" },
              { value: "gates", label: "逻辑门实验" },
            ]}
          />
        </div>

        {tab === "atlas" ? (
          <div className="stack" style={{ gap: 14 }}>
            <Panel title="搜索" sub="名称、符号、同义词都能搜到" actions={<Badge tone="mute">{results.length} 条</Badge>}>
              <div className="nota-search">
                <Search size={14} />
                <input
                  className="input"
                  value={query}
                  placeholder="试试 AND / 与 / ∧ / · / 交集 / 对称差 / 上划线"
                  aria-label="搜索运算概念"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <DisciplineChips value={discipline} onChange={setDiscipline} />
            </Panel>

            {results.length === 0 ? (
              <Empty>
                没有找到「{query}」。搜索支持中英文名称、符号与常见说法，例如「与非」「nand」「(AB)′」「对称差」。
              </Empty>
            ) : (
              <div className="op-grid">
                {results.map((item) => (
                  <OperatorCard
                    key={item.id}
                    entry={item}
                    active={item.id === selected}
                    onSelect={() => setSelected(item.id)}
                  />
                ))}
              </div>
            )}

            <Panel
              title="输入识别器"
              sub="粘贴任何教材写法，看它被读成什么"
              actions={<Badge tone="mute">统一 AST</Badge>}
            >
              <div className="nota-search">
                <Search size={14} />
                <input
                  className="input input--mono"
                  value={readerText}
                  aria-label="输入待识别的表达式"
                  placeholder="例如 AB + C' 或 A NAND B 或 (A∩B)ᶜ"
                  onChange={(event) => setReaderText(event.target.value)}
                />
              </div>

              {reader === null ? (
                <div className="tiny dim">输入一个表达式，这里会显示统一解析结果与真值向量。</div>
              ) : reader.ok ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="reader-line">
                    <span className="field__label">变量</span>
                    <code>{reader.variables.join(", ") || "常量"}</code>
                  </div>
                  <div className="reader-line">
                    <span className="field__label">真值向量</span>
                    <code>{reader.vector}</code>
                  </div>
                  <div className="reader-line">
                    <span className="field__label">当前记法</span>
                    <span>
                      <NotationFormula
                        value={
                          renderNotation(reader.ast, discipline === "all" ? "discrete" : discipline)
                            .nodes
                        }
                      />
                    </span>
                  </div>
                </div>
              ) : (
                <Callout tone="danger" icon={<TriangleAlert size={14} />}>
                  {reader.message}
                  {reader.hint && <div className="tiny dim" style={{ marginTop: 4 }}>{reader.hint}</div>}
                </Callout>
              )}

              {notices.length > 0 && (
                <div className="notice-list">
                  <div className="field__label">解析说明（按语境读，不是字符串替换）</div>
                  {notices.map((notice) => (
                    <div className="notice" key={notice.symbol}>
                      <code>{notice.symbol}</code>
                      <span className="notice__reading">→ {notice.reading}</span>
                      <span className="tiny dim">{notice.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : (
          <GateGallery kind={gateKind} onKindChange={setGateKind} />
        )}
      </main>

      <aside className="inspector" aria-label={tab === "atlas" ? "运算详情" : "逻辑门说明"}>
        {tab === "atlas" ? (
          <>
            <Panel
              title={entry.zh}
              sub={entry.en}
              actions={<Badge tone="accent">{entry.arity} 元运算</Badge>}
            >
              <SymbolButtons entry={entry} />
              <p className="small muted" style={{ lineHeight: 1.7, marginTop: 8 }}>
                {entry.definition}
              </p>
              <div className="gate-mini">
                <GateSymbol kind={entry.gate} />
              </div>
              <table className="mini-tt" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>A</th>
                    {entry.arity === 2 && <th>B</th>}
                    <th>F</th>
                  </tr>
                </thead>
                <tbody>
                  {gateTruth(entry.gate).map((row, i) => (
                    <tr key={i}>
                      <td>{row.a}</td>
                      {row.b !== undefined && <td>{row.b}</td>}
                      <td className={row.f === 1 ? "is-one" : ""}>{row.f}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title="各学科写法" actions={<Badge tone="mute">结构对应</Badge>}>
              <div className="variant-table">
                {DISCIPLINES.map((d) => {
                  const variant = entry.variants[d.id];
                  return (
                    <div className="variant-row" key={d.id}>
                      <div className="variant-row__head">
                        <strong>{d.zh}</strong>
                        <span>{d.en}</span>
                      </div>
                      {variant ? (
                        <>
                          <div className="variant-row__formula">
                            <VariantFormula variant={variant} />
                          </div>
                          <div className="variant-row__note">{variant.note}</div>
                          {variant.forms.length > 1 && (
                            <div className="variant-row__alt">也写作：{variant.forms.join("　")}</div>
                          )}
                        </>
                      ) : (
                        <div className="variant-row__none">
                          无直接对应。{d.id === "set" || d.id === "probability"
                            ? "这个器件在逻辑上不产生新的运算，无法在集合或事件层面找到对应操作。"
                            : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="一个例子" actions={<Badge tone="mute">实例</Badge>}>
              <div className="formula">{entry.example.text}</div>
              <p className="small muted" style={{ lineHeight: 1.7, marginTop: 6 }}>
                {entry.example.explain}
              </p>
            </Panel>

            <Panel title="容易混淆" actions={<Badge tone="warn">{entry.confusions.length}</Badge>}>
              <ul className="stack" style={{ gap: 8 }}>
                {entry.confusions.map((item) => (
                  <li key={item} className="small muted" style={{ lineHeight: 1.65 }}>
                    · {item}
                  </li>
                ))}
              </ul>
            </Panel>

            {entry.studio && (
              <Panel title="去实验台验证">
                <Button
                  block
                  variant="primary"
                  icon={<ArrowRight size={13} />}
                  onClick={() => actions.setStudio(entry.studio!.target)}
                >
                  {entry.studio.label}
                </Button>
                <div className="tiny dim" style={{ marginTop: 8 }}>
                  <Check size={11} style={{ verticalAlign: -1, color: "var(--ok)" }} />
                  {" "}符号只是入口，真正决定含义的是真值表。
                </div>
              </Panel>
            )}
          </>
        ) : (
          <GateInspector kind={gateKind} />
        )}
      </aside>
    </>
  );
}

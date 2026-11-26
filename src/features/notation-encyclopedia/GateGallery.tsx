import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Badge, Button, Callout, Panel, Stat } from "../../components/common";
import { GateSymbol } from "../../components/math/GateSymbol";
import { GateIcon } from "../../components/math/GateIcon";
import { NotationFormula } from "../../components/notation/NotationFormula";
import {
  GATES,
  GATE_KINDS,
  gateOutput,
  gateTruth,
  type GateKind,
} from "../../core/logic-gates/gates";
import { renderNotation } from "../../core/notation/notationConversion";
import { DISCIPLINE_MAP, DISCIPLINES } from "../../core/notation/notationTypes";
import { operatorIdForGate, operatorById, variantFor } from "../../core/notation/notationRegistry";
import { useApp } from "../../store/appStore";

/**
 * 逻辑门实验：切换输入，看输出如何被统一求值内核算出来。
 *
 * 这里不写任何 "if (kind === 'NAND') return !(a && b)"：
 * 输出一律来自 GATES[kind].ast + evaluate()，
 * 真值表一律来自 buildTruthTable()。界面只负责显示。
 */
export function GateGallery({
  kind,
  onKindChange,
}: {
  kind: GateKind;
  onKindChange: (kind: GateKind) => void;
}) {
  const { state } = useApp();
  const [a, setA] = useState<0 | 1>(0);
  const [b, setB] = useState<0 | 1>(0);

  const meta = GATES[kind];
  const entry = operatorById(operatorIdForGate(kind));
  const out = gateOutput(kind, a, b);
  const rows = useMemo(() => gateTruth(kind), [kind]);

  const activeRow = rows.findIndex((row) => row.a === a && (meta.arity === 1 || row.b === b));

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title="逻辑门实验"
        sub="八个门 · 同一求值内核"
        actions={<Badge tone="mute">{GATE_KINDS.length} 种</Badge>}
      >
        <div className="gate-picker" role="group" aria-label="选择逻辑门">
          {GATE_KINDS.map((item) => (
            <button
              key={item}
              type="button"
              className={`gate-pick ${item === kind ? "is-active" : ""}`}
              aria-pressed={item === kind}
              onClick={() => onKindChange(item)}
            >
              <GateIcon kind={item} width={56} height={42} />
              <span className="gate-pick__name">{GATES[item].zh}</span>
              <span className="gate-pick__en">{GATES[item].en.split(" / ")[0]}</span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="gate-stage">
        <div className="gate-stage__left">
          <div className="gate-stage__head">
            <div>
              <h3 className="gate-stage__title">
                {meta.zh}
                <span>{meta.en}</span>
              </h3>
              <p className="small muted">{meta.summary}</p>
            </div>
            <Badge tone={out === 1 ? "ok" : "mute"}>F = {out}</Badge>
          </div>

          <div className={`gate-canvas ${out === 1 ? "is-active" : ""}`}>
            <GateSymbol
              kind={kind}
              active={out === 1}
              highInputs={[
                ...(a === 1 ? ["A"] : []),
                ...(meta.arity === 2 && b === 1 ? ["B"] : []),
              ]}
            />
          </div>

          <div className="gate-inputs">
            <span className="field__label">输入</span>
            <button
              type="button"
              className={`input-toggle ${a === 1 ? "is-on" : ""}`}
              aria-pressed={a === 1}
              onClick={() => setA(a === 1 ? 0 : 1)}
            >
              <span className="input-toggle__lamp" />A = {a}
            </button>
            {meta.arity === 2 && (
              <button
                type="button"
                className={`input-toggle ${b === 1 ? "is-on" : ""}`}
                aria-pressed={b === 1}
                onClick={() => setB(b === 1 ? 0 : 1)}
              >
                <span className="input-toggle__lamp" />B = {b}
              </button>
            )}
            <span className="gate-output" aria-live="polite">
              <span className={`lamp ${out === 1 ? "is-on" : ""}`} />
              输出 F = {out}
            </span>
          </div>
        </div>

        <div className="gate-stage__right">
          <table className="mini-tt gate-tt">
            <caption className="gate-tt__caption">真值表（当前行高亮）</caption>
            <thead>
              <tr>
                <th>A</th>
                {meta.arity === 2 && <th>B</th>}
                <th>F</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i === activeRow ? "is-current" : ""}>
                  <td>{row.a}</td>
                  {row.b !== undefined && <td>{row.b}</td>}
                  <td className={row.f === 1 ? "is-one" : ""}>{row.f}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="gate-legend">
            <span className="lamp is-on" /> 输出 1
            <span className="lamp" /> 输出 0
          </div>
        </div>
      </div>

      <Panel title="同一个门的五种写法" sub="同一 AST · 五种记号">
        <div className="nota-list">
          {DISCIPLINES.map((d) => {
            const variant = variantFor(entry, d.id);
            const rendered = renderNotation(meta.ast, d.id, state.notationStyle);
            return (
              <div className="nota-row" key={d.id}>
                <div className="nota-row__label">
                  <strong>{d.zh}</strong>
                  <span>{d.en}</span>
                </div>
                <div className="nota-row__formula">
                  {variant ? (
                    <NotationFormula value={rendered.nodes} size="md" />
                  ) : (
                    <span className="nota-none">无直接对应</span>
                  )}
                </div>
                <div className="nota-row__note">{variant?.note ?? "该学科没有与这个器件对应的运算。"}</div>
              </div>
            );
          })}
        </div>
        <Callout tone="plain">
          同或、或非、与非的模板形状与基本门相同，区别只在输出端那个小圆圈：
          圈表示取反，不是另一种形状。
        </Callout>
      </Panel>
    </div>
  );
}

/** 门实验的右侧检查器：原则、混淆点、跳转 */
export function GateInspector({ kind }: { kind: GateKind }) {
  const { actions } = useApp();
  const meta = GATES[kind];
  const entry = operatorById(operatorIdForGate(kind));

  return (
    <>
      <Panel
        title={`${meta.zh} · ${meta.en}`}
        actions={<Badge tone="accent">{meta.arity} 输入</Badge>}
      >
        <div className="stat-grid">
          <Stat label="输入数" value={meta.arity} />
          <Stat label="输出为 1 的行" value={gateTruth(kind).filter((r) => r.f === 1).length} />
          <Stat label="符号" value={entry.symbols[0] ?? "—"} />
        </div>
        <div className="stack" style={{ gap: 7, marginTop: 10 }}>
          <div className="field__label">工作原理</div>
          <p className="small muted" style={{ lineHeight: 1.65 }}>
            {meta.principle}
          </p>
        </div>
      </Panel>

      <Panel title="常见混淆" actions={<Badge tone="warn">{entry.confusions.length}</Badge>}>
        <ul className="stack" style={{ gap: 8 }}>
          {entry.confusions.map((item) => (
            <li key={item} className="small muted" style={{ lineHeight: 1.65 }}>
              · {item}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="对照其他学科" actions={<Badge tone="mute">结构对应</Badge>}>
        <div className="stack" style={{ gap: 8 }}>
          {DISCIPLINES.map((d) => {
            const variant = variantFor(entry, d.id);
            const rendered = renderNotation(meta.ast, d.id, "textbook");
            return (
              <div key={d.id} className="variant-line">
                <span className="variant-line__d">{DISCIPLINE_MAP[d.id].short}</span>
                <span className="variant-line__v">
                  {variant ? <NotationFormula value={rendered.nodes} size="sm" /> : "无直接对应"}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="下一步">
        <div className="stack" style={{ gap: 8 }}>
          <Button
            block
            icon={<ArrowRight size={13} />}
            onClick={() => actions.setStudio(entry.studio?.target ?? "logic")}
          >
            {entry.studio?.label ?? "去逻辑工作台"}
          </Button>
          <Button block variant="ghost" onClick={() => actions.setStudio("gate")}>
            用门级搭建自己连一个
          </Button>
          <div className="tiny dim">
            <Check size={11} style={{ verticalAlign: -1, color: "var(--ok)" }} />
            {" "}界面上的输出与真值表都由同一个求值器算出，不是写死的表。
          </div>
        </div>
      </Panel>
    </>
  );
}

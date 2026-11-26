import { useMemo } from "react";
import { Copy, ShieldAlert, ShieldCheck, Type } from "lucide-react";
import type { BoolNode } from "../../core/boolean/ast";
import {
  notationTitle,
  renderAllDisciplines,
  renderNotation,
} from "../../core/notation/notationConversion";
import { verifyAllModes } from "../../core/notation/notationValidation";
import {
  DISCIPLINES,
  DISCIPLINE_MAP,
  type NotationMode,
  type RenderedNotation,
} from "../../core/notation/notationTypes";
import { useApp } from "../../store/appStore";
import { Badge, Button, Callout, Segmented } from "../common";
import { NotationFormula } from "./NotationFormula";

const MODE_OPTIONS: Array<{ value: NotationMode; label: string; title: string }> = [
  ...DISCIPLINES.map((d) => ({ value: d.id as NotationMode, label: d.short, title: `${d.zh} · ${d.en}` })),
  { value: "all", label: "全学科", title: "五种写法并排对照" },
];

export function NotationSwitcher({ block = true }: { block?: boolean }) {
  const { state, actions } = useApp();
  return (
    <div className="nota-switch">
      <Segmented
        block={block}
        value={state.notationMode}
        onChange={actions.setNotationMode}
        label="符号模式"
        options={MODE_OPTIONS}
      />
      <button
        type="button"
        className="nota-style"
        aria-pressed={state.notationStyle === "compact"}
        onClick={actions.toggleNotationStyle}
        title="教材记法使用上划线、∧、ᶜ 等规范符号；简写记法省略乘号与空格，便于键盘记录"
      >
        <Type size={12} />
        {state.notationStyle === "textbook" ? "教材记法" : "简写记法"}
      </button>
    </div>
  );
}

function CopyFormula({ text, onDone }: { text: string; onDone: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<Copy size={12} />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          onDone();
        } catch {
          /* 剪贴板被拒绝时静默失败，用户仍可选中文本复制 */
        }
      }}
      title="复制当前记法的表达式（上划线会写成撇号）"
    >
      复制
    </Button>
  );
}

/**
 * 符号面板：同一个函数在选定学科下的写法 + 语境说明 + 回读校验。
 *
 * 回读校验不是装饰：它把渲染出来的文本重新交给解析器，
 * 逐行比对真值。如果哪天渲染器少写了一层括号，这里会立刻变红。
 */
export function NotationBoard({
  ast,
  heading = "同一函数的五种写法",
  note,
}: {
  ast: BoolNode | null;
  heading?: string;
  note?: string;
}) {
  const { state, actions } = useApp();

  const rendered = useMemo<RenderedNotation[]>(() => {
    if (!ast) return [];
    return state.notationMode === "all"
      ? renderAllDisciplines(ast, state.notationStyle)
      : [renderNotation(ast, state.notationMode, state.notationStyle)];
  }, [ast, state.notationMode, state.notationStyle]);

  const verification = useMemo(() => {
    if (!ast) return null;
    const checks = verifyAllModes(ast, state.notationStyle);
    return { checks, ok: checks.every((c) => c.ok) };
  }, [ast, state.notationStyle]);

  const copyBody = rendered.map((r) => r.text).join("\n");

  if (!ast) {
    return (
      <Callout tone="plain">
        当前函数由真值表直接定义，没有原始表达式。切换到表达式输入后即可查看跨学科写法。
      </Callout>
    );
  }

  return (
    <div className="nota-board">
      <div className="nota-board__head">
        <div className="nota-board__title">{heading}</div>
        <div className="nota-board__actions">
          {verification && (
            <Badge
              tone={verification.ok ? "ok" : "danger"}
              title={
                verification.ok
                  ? "把渲染结果重新解析后与真值表逐行比对，五种记法全部一致"
                  : verification.checks
                      .filter((c) => !c.ok)
                      .map((c) => `${DISCIPLINE_MAP[c.mode].zh}：${c.mismatches.join("；")}`)
                      .join("\n")
              }
            >
              {verification.ok ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
              回读校验 {verification.checks.filter((c) => c.ok).length}/{verification.checks.length}
            </Badge>
          )}
          <CopyFormula
            text={copyBody}
            onDone={() => actions.notify("ok", "表达式已复制（上划线写作撇号）")}
          />
        </div>
      </div>

      <NotationSwitcher />

      {state.notationMode === "all" ? (
        <div className="nota-list">
          {rendered.map((item) => {
            const info = DISCIPLINE_MAP[item.mode];
            return (
              <div className="nota-row" key={item.mode}>
                <div className="nota-row__label">
                  <strong>{info.zh}</strong>
                  <span>{info.en}</span>
                </div>
                <div className="nota-row__formula">
                  <NotationFormula value={item.nodes} size="md" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="nota-hero">
          <div className="nota-hero__label">{notationTitle(state.notationMode, state.notationStyle)}</div>
          <div className="nota-hero__formula">
            <NotationFormula value={rendered[0].nodes} size="lg" />
          </div>
          <div className="nota-hero__caveat">{rendered[0].caveat}</div>
          {rendered[0].conditions && rendered[0].conditions.length > 0 && (
            <ul className="nota-conditions">
              {rendered[0].conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.notationMode === "all" && (
        <div className="nota-board__foot">
          <span className="tiny dim">
            同一结构，不同语言：这些写法共享同一个真值表，但命题、门电路、集合与事件是不同对象，
            不能互相替换着说话。
          </span>
        </div>
      )}

      {note && <div className="nota-board__note">{note}</div>}
    </div>
  );
}

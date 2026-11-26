import { useRef } from "react";
import { AlertTriangle, Check, Info, RotateCcw } from "lucide-react";
import { Button } from "../common";
import {
  applyPalette,
  hintFor,
  noteFor,
  paletteFor,
  placeholderFor,
} from "../../core/notation/editorPalette";
import { NotationFormula } from "../notation/NotationFormula";
import type { NotationMode } from "../../core/notation/notationTypes";

/** 词法层接受的取反写法：撇号、上标 c、上划线，以及前缀的 ! ¬ ~ */
const NEGATION_INPUT = /['′ᶜ̅¬~!]/;

export interface ExpressionErrorInfo {
  message: string;
  position: number;
  hint: string;
}

export function ExpressionEditor({
  value,
  onChange,
  error,
  variables,
  mintermCount,
  dontCareCount,
  history,
  onReset,
  rows,
  notation = "digital",
}: {
  value: string;
  onChange: (value: string) => void;
  error: ExpressionErrorInfo | null;
  variables: string[];
  mintermCount: number;
  dontCareCount?: number;
  history: string[];
  onReset: () => void;
  rows: number;
  /** 按钮与占位符跟随当前学科记法；数电下是 · + ′ ⊕ */
  notation?: NotationMode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const buttons = paletteFor(notation);
  // 只在「输入符号与渲染符号不同形」且式子里真的含取反时才提示：
  // 默认示例里没有非，凭空挂一句说明只会变成噪音。
  const note = noteFor(notation);
  const showNote = note !== null && NEGATION_INPUT.test(value);

  const insert = (button: (typeof buttons)[number]) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, caret } = applyPalette(button, value, start, end);
    onChange(text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const errPos = error ? Math.max(0, Math.min(error.position, value.length)) : 0;

  return (
    <div className="stack" style={{ gap: 9 }}>
      <div className="expr-input-wrap">
        <textarea
          ref={ref}
          className={`expr-input ${error ? "is-error" : "is-ok"}`}
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="布尔表达式输入"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "expr-error-msg" : undefined}
          placeholder={placeholderFor(notation)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      <div className="expr-toolbar" role="toolbar" aria-label="运算符快捷插入">
        {buttons.map((op) => (
          <button
            key={op.id}
            type="button"
            className="op-btn"
            title={op.title}
            aria-label={op.title}
            onClick={() => insert(op)}
          >
            {op.label}
          </button>
        ))}
      </div>

      <div className="expr-hint-row">
        <span className="tiny dim">{hintFor(notation)}</span>
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={12} />}
          onClick={onReset}
          title="恢复默认示例"
        >
          示例
        </Button>
      </div>

      {showNote && note && (
        <div className="expr-note">
          <Info size={11} />
          <span className="expr-note__body">
            {note.before}
            {note.sample && (
              <NotationFormula value={note.sample} size="sm" className="expr-note__sample" />
            )}
            {note.after}
          </span>
        </div>
      )}

      {error ? (
        <div className="expr-error" id="expr-error-msg" role="alert">
          <div className="expr-error__head">
            <AlertTriangle size={13} />
            {error.message}
          </div>
          <pre className="expr-error__code" aria-label="出错位置">
            {value.slice(0, errPos)}
            <span className="expr-error__mark">{value.slice(errPos, errPos + 1) || " "}</span>
            {value.slice(errPos + 1)}
          </pre>
          {error.hint && <div className="expr-error__hint">修正方向：{error.hint}</div>}
        </div>
      ) : (
        <div className="expr-status">
          <span style={{ color: "var(--ok)", display: "inline-flex" }}>
            <Check size={12} />
          </span>
          <span>
            已解析 · {variables.length} 个变量 · {rows} 行真值表 · {mintermCount} 个最小项
            {dontCareCount ? ` · ${dontCareCount} 个无关项` : ""}
          </span>
        </div>
      )}

      {history.length > 0 && (
        <div className="stack" style={{ gap: 5 }}>
          <span className="field__label" style={{ fontSize: 10 }}>
            最近使用
          </span>
          <div className="expr-history">
            {history.map((item) => (
              <button
                key={item}
                type="button"
                className="history-chip"
                title={item}
                onClick={() => onChange(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

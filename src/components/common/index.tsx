import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";

/* ==========================================================================
   基础组件
   ========================================================================== */

type ButtonVariant = "default" | "primary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  block,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    variant !== "default" ? `btn--${variant}` : "",
    size !== "md" ? `btn--${size}` : "",
    !children ? "btn--icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} style={block ? { width: "100%" } : undefined} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function Panel({
  title,
  sub,
  actions,
  children,
  flush,
  className = "",
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`panel ${className}`} id={id}>
      {(title || actions) && (
        <header className="panel__head">
          <div className="panel__title">
            <span className="panel__name">{title}</span>
            {sub && <span className="sub">{sub}</span>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className={`panel__body ${flush ? "panel__body--flush" : ""}`}>{children}</div>
    </section>
  );
}

export function Badge({
  tone = "mute",
  children,
  title,
}: {
  tone?: "mute" | "ok" | "warn" | "danger" | "accent";
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  extra,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        <span>{label}</span>
        {extra}
      </label>
      {children}
      {error ? <div className="field__error">{error}</div> : hint ? <div className="field__hint">{hint}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  block,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  block?: boolean;
  label?: string;
}) {
  return (
    <div className={`segmented ${block ? "segmented--block" : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__item ${value === option.value ? "is-active" : ""}`}
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ "--fill": `${fill}%` } as React.CSSProperties}
    />
  );
}

export function Callout({
  tone = "info",
  children,
  icon,
}: {
  tone?: "info" | "ok" | "warn" | "danger" | "plain";
  children: ReactNode;
  icon?: ReactNode;
}) {
  const fallback =
    tone === "warn" || tone === "danger" ? (
      <AlertTriangle size={14} />
    ) : tone === "ok" ? (
      <Check size={14} />
    ) : (
      <Info size={14} />
    );
  return (
    <div className={`callout ${tone !== "plain" ? `callout--${tone}` : ""}`}>
      {icon ?? fallback}
      <div>{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
}) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Toast({
  kind,
  text,
  onClose,
}: {
  kind: "ok" | "warn" | "error";
  text: string;
  onClose: () => void;
}) {
  return (
    <div className={`toast toast--${kind}`} role="status" aria-live="polite">
      <span style={{ color: kind === "error" ? "var(--danger)" : kind === "warn" ? "var(--warn)" : "var(--ok)" }}>
        {kind === "ok" ? <Check size={14} /> : kind === "warn" ? <AlertTriangle size={14} /> : <X size={14} />}
      </span>
      <span>{text}</span>
      <button type="button" className="toast__close" onClick={onClose} aria-label="关闭提示">
        <X size={13} />
      </button>
    </div>
  );
}

export function SectionHead({
  title,
  hint,
  actions,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {hint && <span className="hint">{hint}</span>}
      {actions}
    </div>
  );
}

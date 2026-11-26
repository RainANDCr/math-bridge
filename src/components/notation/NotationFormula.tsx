import { Fragment, type ReactNode } from "react";
import { notaText, type NotaNode } from "../../core/notation/notationTypes";

/**
 * 数学排版组件
 *
 * 全站的上划线、上标、括号都必须经过这里渲染，
 * 否则会出现「数电页面的横线只盖住一个字母、括号页面的横线盖住整个括号」
 * 这类不一致 —— 它们在语义上是完全不同的两个函数。
 */

function renderNode(node: NotaNode, key: number): ReactNode {
  switch (node.kind) {
    case "text":
      return (
        <span key={key} className={`nota__${node.role}`}>
          {node.text}
        </span>
      );
    case "seq":
      return <Fragment key={key}>{node.children.map((child, i) => renderNode(child, i))}</Fragment>;
    case "bar":
      return (
        <span key={key} className="nota__bar">
          {renderNode(node.children, 0)}
        </span>
      );
    case "sup":
      return (
        <sup key={key} className="nota__sup">
          {node.text}
        </sup>
      );
  }
}

export function NotationFormula({
  value,
  size = "md",
  className = "",
  title,
}: {
  value: NotaNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  title?: string;
}) {
  const flat = notaText(value);
  return (
    <span
      className={`nota nota--${size} ${className}`}
      role="math"
      aria-label={flat}
      title={title ?? flat}
    >
      {renderNode(value, 0)}
    </span>
  );
}

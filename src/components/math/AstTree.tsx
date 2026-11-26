import type { BoolNode } from "../../core/boolean/ast";

/**
 * 表达式结构树
 * 用于让学生看见「这个表达式实际是怎么被组织的」，
 * 与卡诺图的分组、电路的门一一对应。
 */

const SYMBOL = { and: "AND", or: "OR", xor: "XOR", not: "NOT" } as const;

export function AstTree({ node, depth = 0 }: { node: BoolNode; depth?: number }) {
  if (node.kind === "var") {
    return (
      <div className="ast-row">
        <span className="ast-tag ast-tag--var">VAR</span>
        <span className="ast-name">{node.name}</span>
      </div>
    );
  }

  if (node.kind === "const") {
    return (
      <div className="ast-row">
        <span className="ast-tag">CONST</span>
        <span className="ast-name">{node.value}</span>
      </div>
    );
  }

  if (node.kind === "not") {
    return (
      <div className="ast-node">
        <div className="ast-row">
          <span className="ast-tag ast-tag--op">NOT</span>
          <span className="ast-name">¬</span>
        </div>
        <div className="ast-children">
          <AstTree node={node.operand} depth={depth + 1} />
        </div>
      </div>
    );
  }

  return (
    <div className="ast-node">
      <div className="ast-row">
        <span className="ast-tag ast-tag--op">{SYMBOL[node.kind]}</span>
        <span className="ast-name">
          {node.kind === "and" ? "·" : node.kind === "or" ? "+" : "⊕"}
        </span>
      </div>
      <div className="ast-children">
        <AstTree node={node.left} depth={depth + 1} />
        <AstTree node={node.right} depth={depth + 1} />
      </div>
    </div>
  );
}

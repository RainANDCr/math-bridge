/**
 * AST —— 布尔表达式的抽象语法树
 *
 * 设计原则：AST 只描述「结构」，不携带任何 UI 信息。
 * 所有工作台（真值表 / 卡诺图 / 电路 / 概率）都从同一棵 AST 或同一个真值向量出发，
 * 避免出现「表达式说 1、卡诺图说 0」这种不一致。
 */

export type BoolNode =
  | { kind: "var"; name: string }
  | { kind: "const"; value: 0 | 1 }
  | { kind: "not"; operand: BoolNode }
  | { kind: "and"; left: BoolNode; right: BoolNode }
  | { kind: "or"; left: BoolNode; right: BoolNode }
  | { kind: "xor"; left: BoolNode; right: BoolNode };

export type BoolOperator = "!" | "&" | "|" | "^";

export const isBinaryNode = (
  node: BoolNode
): node is Extract<BoolNode, { kind: "and" | "or" | "xor" }> =>
  node.kind === "and" || node.kind === "or" || node.kind === "xor";

/** 按出现顺序收集变量名（不排序，用于「首次出现」语义） */
export function collectVariables(node: BoolNode, out: string[] = []): string[] {
  switch (node.kind) {
    case "var":
      if (!out.includes(node.name)) out.push(node.name);
      break;
    case "const":
      break;
    case "not":
      collectVariables(node.operand, out);
      break;
    default:
      collectVariables(node.left, out);
      collectVariables(node.right, out);
  }
  return out;
}

export function countNodes(node: BoolNode): number {
  switch (node.kind) {
    case "var":
    case "const":
      return 1;
    case "not":
      return 1 + countNodes(node.operand);
    default:
      return 1 + countNodes(node.left) + countNodes(node.right);
  }
}

export function depth(node: BoolNode): number {
  switch (node.kind) {
    case "var":
    case "const":
      return 1;
    case "not":
      return 1 + depth(node.operand);
    default:
      return 1 + Math.max(depth(node.left), depth(node.right));
  }
}

/** 结构化克隆（本项目的 AST 不可变，这里只用于需要独立引用的场合） */
export function cloneNode(node: BoolNode): BoolNode {
  switch (node.kind) {
    case "var":
      return { kind: "var", name: node.name };
    case "const":
      return { kind: "const", value: node.value };
    case "not":
      return { kind: "not", operand: cloneNode(node.operand) };
    default:
      return {
        kind: node.kind,
        left: cloneNode(node.left),
        right: cloneNode(node.right),
      } as BoolNode;
  }
}

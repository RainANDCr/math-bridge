import type { BoolNode } from "./ast";

export interface PrintOptions {
  /** pretty: ¬A · B + C⊕D ; ascii: !A & B | C^D */
  style?: "pretty" | "ascii";
  /** 是否给 AND 两侧加空格 */
  spaced?: boolean;
}

const PREC = { or: 1, xor: 2, and: 3, not: 4, atom: 5 } as const;

function symbol(kind: "not" | "and" | "or" | "xor", style: "pretty" | "ascii"): string {
  if (style === "ascii") {
    return kind === "not" ? "!" : kind === "and" ? "&" : kind === "or" ? "|" : "^";
  }
  return kind === "not" ? "¬" : kind === "and" ? "·" : kind === "or" ? "+" : "⊕";
}

/** 运算符两侧的空白：与界面上的写法保持一致 */
function separator(kind: "and" | "or" | "xor", style: "pretty" | "ascii"): string {
  if (style === "pretty") return kind === "or" ? " + " : symbol(kind, style);
  return ` ${symbol(kind, style)} `;
}

function wrap(text: string, needed: boolean): string {
  return needed ? `(${text})` : text;
}

function printNode(node: BoolNode, minPrec: number, style: "pretty" | "ascii"): string {
  switch (node.kind) {
    case "var":
      return node.name;
    case "const":
      return String(node.value);
    case "not": {
      const inner = printNode(node.operand, PREC.not, style);
      const text = `${symbol("not", style)}${inner}`;
      return wrap(text, PREC.not < minPrec);
    }
    case "and":
    case "or":
    case "xor": {
      const own = PREC[node.kind];
      const sep = separator(node.kind, style);
      const left = printNode(node.left, own, style);
      const right = printNode(node.right, own, style);
      return wrap(`${left}${sep}${right}`, own < minPrec);
    }
  }
}

/** 输出无歧义、可回填到输入框的表达式文本 */
export function toExpressionString(node: BoolNode, options: PrintOptions = {}): string {
  return printNode(node, 0, options.style ?? "pretty");
}

/** 输出带函数头的完整形式，例如 F(A, B, C) = A·B + C */
export function toFunctionString(
  node: BoolNode,
  variables: string[],
  options: PrintOptions = {}
): string {
  return `F(${variables.join(", ")}) = ${toExpressionString(node, options)}`;
}

/**
 * 统计文字量（多用于「化简后更短」的对比展示）。
 */
export function countLiterals(node: BoolNode): number {
  switch (node.kind) {
    case "var":
      return 1;
    case "const":
      return 0;
    case "not":
      return countLiterals(node.operand);
    default:
      return countLiterals(node.left) + countLiterals(node.right);
  }
}

/**
 * 把 AST 转成只含 and/or/not 的形式说明（XOR 展开），
 * 用于向学生解释「异或其实是 (A·¬B) + (¬A·B)」。
 */
export function xorExpansion(node: BoolNode): BoolNode {
  switch (node.kind) {
    case "var":
    case "const":
      return node;
    case "not":
      return { kind: "not", operand: xorExpansion(node.operand) };
    case "and":
    case "or":
      return {
        kind: node.kind,
        left: xorExpansion(node.left),
        right: xorExpansion(node.right),
      } as BoolNode;
    case "xor": {
      const a = xorExpansion(node.left);
      const b = xorExpansion(node.right);
      return {
        kind: "or",
        left: { kind: "and", left: a, right: { kind: "not", operand: b } },
        right: { kind: "and", left: { kind: "not", operand: a }, right: b },
      };
    }
  }
}

import type { BoolNode } from "./ast";
import { ExpressionError } from "./errors";
import { tokenize, type Token } from "./tokenizer";

/**
 * 递归下降语法分析
 *
 * 优先级（从高到低）：NOT → AND / NAND → XOR / XNOR → OR / NOR
 * 同级左结合；括号最高。
 *
 *   expr    := xorExpr ( OR xorExpr | NOR xorExpr )*
 *   xorExpr := andExpr ( XOR andExpr | XNOR andExpr )*
 *   andExpr := unary ( AND unary | NAND unary | 隐式与 unary )*
 *   unary   := NOT unary | postfix
 *   postfix := primary ( POSTFIX )*
 *   primary := VAR | CONST | "(" expr ")"
 *
 * 「隐式与」是布尔代数的省略乘号写法：AB 即 A·B，A(B+C) 即 A·(B+C)。
 * 它只在 AND 层级生效，因此 AB + C 仍然是 (A·B) + C。
 */

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[], private readonly offset: number) {}

  parse(): BoolNode {
    if (this.tokens.length === 0) {
      throw new ExpressionError("表达式为空", this.offset, "试试输入 A·B，或点击下方的示例");
    }
    const node = this.parseOr();
    const rest = this.peek();
    if (rest) {
      throw new ExpressionError(
        `表达式在 “${rest.text}” 之前已经结束，后面还有多余内容`,
        rest.start + this.offset,
        "检查是否缺少运算符：相邻变量之间可以省略乘号（AB），但括号外多余的符号需要删除",
        Math.max(1, rest.end - rest.start)
      );
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private parseOr(): BoolNode {
    let left = this.parseXor();
    for (;;) {
      const token = this.peek();
      if (token?.type === "OR") {
        this.next();
        left = { kind: "or", left, right: this.parseXor() };
        continue;
      }
      if (token?.type === "NOR") {
        this.next();
        left = { kind: "not", operand: { kind: "or", left, right: this.parseXor() } };
        continue;
      }
      return left;
    }
  }

  private parseXor(): BoolNode {
    let left = this.parseAnd();
    for (;;) {
      const token = this.peek();
      if (token?.type === "XOR") {
        this.next();
        left = { kind: "xor", left, right: this.parseAnd() };
        continue;
      }
      if (token?.type === "XNOR") {
        this.next();
        left = { kind: "not", operand: { kind: "xor", left, right: this.parseAnd() } };
        continue;
      }
      return left;
    }
  }

  private parseAnd(): BoolNode {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (!token) return left;
      if (token.type === "AND") {
        this.next();
        left = { kind: "and", left, right: this.parseUnary() };
        continue;
      }
      if (token.type === "NAND") {
        this.next();
        left = { kind: "not", operand: { kind: "and", left, right: this.parseUnary() } };
        continue;
      }
      // 隐式与：AB、A(B+C)、A!B
      if (
        token.type === "VAR" ||
        token.type === "CONST" ||
        token.type === "LPAREN" ||
        token.type === "NOT"
      ) {
        left = { kind: "and", left, right: this.parseUnary() };
        continue;
      }
      return left;
    }
  }

  private parseUnary(): BoolNode {
    const token = this.peek();
    if (token?.type === "NOT") {
      this.next();
      return { kind: "not", operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): BoolNode {
    let node = this.parsePrimary();
    while (this.peek()?.type === "POSTFIX") {
      this.next();
      node = { kind: "not", operand: node };
    }
    return node;
  }

  private parsePrimary(): BoolNode {
    const token = this.next();

    if (!token) {
      const last = this.tokens[this.tokens.length - 1];
      const position = last ? last.end + this.offset : this.offset;
      throw new ExpressionError(
        "表达式在这里意外结束",
        position,
        "缺少一个操作数：可能运算符后面没写变量，或括号没有闭合"
      );
    }

    if (token.type === "VAR") {
      return { kind: "var", name: token.value };
    }

    if (token.type === "CONST") {
      return { kind: "const", value: token.value === "1" ? 1 : 0 };
    }

    if (token.type === "LPAREN") {
      if (this.peek()?.type === "RPAREN") {
        throw new ExpressionError(
          "括号内是空的",
          token.start + this.offset,
          "括号内必须有一个完整的表达式，例如 (A·B)"
        );
      }
      const inner = this.parseOr();
      const close = this.next();
      if (!close || close.type !== "RPAREN") {
        throw new ExpressionError(
          "括号没有闭合",
          token.start + this.offset,
          "补上一个 “)”，或删除这个多余的 “(”"
        );
      }
      return inner;
    }

    if (token.type === "RPAREN") {
      throw new ExpressionError(
        "这里多了一个右括号",
        token.start + this.offset,
        "检查左括号是否缺失，例如 A·B) 应写成 (A·B)"
      );
    }

    if (token.type === "POSTFIX") {
      throw new ExpressionError(
        `“${token.text}” 前面没有可以取反的对象`,
        token.start + this.offset,
        "后缀取反必须紧跟变量或括号，例如 A' 或 (A+B)ᶜ"
      );
    }

    throw new ExpressionError(
      `运算符 “${token.text}” 前面缺少操作数`,
      token.start + this.offset,
      "运算符两侧都需要变量或括号，例如 A′·B / A + (B·C)"
    );
  }
}

/** 去掉形如 `F =` / `Y=` 的赋值前缀，并返回偏移量用于错误定位 */
function stripAssignmentPrefix(source: string): { body: string; offset: number } {
  const match = /^(\s*)([A-Za-z][A-Za-z0-9_]*)\s*=\s*/.exec(source);
  if (!match) return { body: source, offset: 0 };
  const body = source.slice(match[0].length);
  return { body, offset: match[0].length };
}

export interface ParseResult {
  ast: BoolNode;
  /** 去掉赋值前缀后的表达式原文 */
  body: string;
}

export function parseExpression(source: string): ParseResult {
  const { body, offset } = stripAssignmentPrefix(source);
  let tokens: Token[];
  try {
    tokens = tokenize(body);
  } catch (error) {
    if (error instanceof ExpressionError) {
      throw new ExpressionError(
        error.message,
        error.position + offset,
        error.hint,
        error.length
      );
    }
    throw error;
  }
  const ast = new Parser(tokens, offset).parse();
  return { ast, body };
}

/** 便捷函数：只要 AST */
export function parse(source: string): BoolNode {
  return parseExpression(source).ast;
}

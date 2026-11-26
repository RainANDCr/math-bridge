import type { BoolNode } from "./ast";

/**
 * 求值器：给定变量赋值，计算布尔值。
 * 变量顺序由调用方给出，索引 i 对应 2^(n-1-i) 位（A 为最高位），
 * 这与教科书中最小项编号 m0..m(2^n-1) 的约定一致。
 */

export type Assignment = Record<string, boolean>;

export function evaluate(node: BoolNode, assignment: Assignment): boolean {
  switch (node.kind) {
    case "var": {
      const value = assignment[node.name];
      if (value === undefined) {
        throw new Error(`变量 ${node.name} 没有赋值`);
      }
      return value;
    }
    case "const":
      return node.value === 1;
    case "not":
      return !evaluate(node.operand, assignment);
    case "and":
      return evaluate(node.left, assignment) && evaluate(node.right, assignment);
    case "or":
      return evaluate(node.left, assignment) || evaluate(node.right, assignment);
    case "xor":
      return evaluate(node.left, assignment) !== evaluate(node.right, assignment);
  }
}

/** 用最小项编号求值：index 的二进制表示即变量取值，A 为最高位。 */
export function evaluateAtIndex(node: BoolNode, variables: string[], index: number): boolean {
  const assignment: Assignment = {};
  const n = variables.length;
  for (let i = 0; i < n; i += 1) {
    const bit = (index >> (n - 1 - i)) & 1;
    assignment[variables[i]] = bit === 1;
  }
  return evaluate(node, assignment);
}

import type { BoolNode } from "../boolean/ast";

/**
 * 逻辑电路模型
 *
 * AST → 门级网表。连续的同种运算会被合并成一个多输入门
 * （A·B·C 画成一个三输入 AND，而不是两个二输入门），
 * 这样更接近教科书画法，也更容易阅读。
 */

export type GateType = "AND" | "OR" | "NOT" | "XOR" | "INPUT" | "CONST";

export interface CircuitNode {
  id: string;
  type: GateType;
  /** 输入节点的 id */
  inputs: string[];
  /** 显示文字：INPUT 为变量名，CONST 为 0/1，门为运算符 */
  label: string;
  /** 从输入到该节点的最长路径（输入层为 0） */
  depth: number;
}

export interface Circuit {
  nodes: CircuitNode[];
  outputId: string;
  inputVariables: string[];
}

const GATE_LABEL: Record<"and" | "or" | "xor", GateType> = {
  and: "AND",
  or: "OR",
  xor: "XOR",
};

class CircuitBuilder {
  private nodes: CircuitNode[] = [];
  private counter = 0;
  private inputMap = new Map<string, string>();

  build(ast: BoolNode): Circuit {
    const outputId = this.visit(ast);
    const variables = [...this.inputMap.keys()].sort();
    return { nodes: this.nodes, outputId, inputVariables: variables };
  }

  private add(node: Omit<CircuitNode, "id">): string {
    const id = `n${this.counter++}`;
    this.nodes.push({ ...node, id });
    return id;
  }

  private visit(node: BoolNode): string {
    switch (node.kind) {
      case "var": {
        const existing = this.inputMap.get(node.name);
        if (existing) return existing;
        const id = this.add({
          type: "INPUT",
          inputs: [],
          label: node.name,
          depth: 0,
        });
        this.inputMap.set(node.name, id);
        return id;
      }
      case "const":
        return this.add({
          type: "CONST",
          inputs: [],
          label: String(node.value),
          depth: 0,
        });
      case "not": {
        const child = this.visit(node.operand);
        const depth = this.depthOf(child) + 1;
        return this.add({ type: "NOT", inputs: [child], label: "NOT", depth });
      }
      case "and":
      case "or":
      case "xor": {
        const operands = flatten(node, node.kind);
        const childIds = operands.map((child) => this.visit(child));
        const depth = Math.max(...childIds.map((id) => this.depthOf(id))) + 1;
        return this.add({
          type: GATE_LABEL[node.kind],
          inputs: childIds,
          label: GATE_LABEL[node.kind],
          depth,
        });
      }
    }
  }

  private depthOf(id: string): number {
    return this.nodes.find((n) => n.id === id)?.depth ?? 0;
  }
}

function flatten(node: BoolNode, kind: "and" | "or" | "xor"): BoolNode[] {
  if (node.kind !== kind) return [node];
  const binary = node as Extract<BoolNode, { kind: "and" | "or" | "xor" }>;
  return [...flatten(binary.left, kind), ...flatten(binary.right, kind)];
}

export function buildCircuit(ast: BoolNode): Circuit {
  return new CircuitBuilder().build(ast);
}

export function gateArity(node: CircuitNode): number {
  return node.inputs.length;
}

export function maxDepth(circuit: Circuit): number {
  return circuit.nodes.reduce((acc, n) => Math.max(acc, n.depth), 0);
}

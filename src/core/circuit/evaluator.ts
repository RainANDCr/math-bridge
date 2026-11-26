import type { Circuit } from "./model";

export type Bit = 0 | 1;

/**
 * 门级求值
 *
 * 网表按「子节点先于父节点」的顺序构建，因此一次线性遍历即可完成求值，
 * 不需要拓扑排序。
 */
export function evaluateCircuit(
  circuit: Circuit,
  assignment: Record<string, Bit>
): Map<string, Bit> {
  const values = new Map<string, Bit>();
  for (const node of circuit.nodes) {
    switch (node.type) {
      case "INPUT": {
        values.set(node.id, assignment[node.label] ?? 0);
        break;
      }
      case "CONST": {
        values.set(node.id, node.label === "1" ? 1 : 0);
        break;
      }
      case "NOT": {
        const input = values.get(node.inputs[0]) ?? 0;
        values.set(node.id, input === 1 ? 0 : 1);
        break;
      }
      case "AND": {
        const out = node.inputs.every((id) => (values.get(id) ?? 0) === 1) ? 1 : 0;
        values.set(node.id, out);
        break;
      }
      case "OR": {
        const out = node.inputs.some((id) => (values.get(id) ?? 0) === 1) ? 1 : 0;
        values.set(node.id, out);
        break;
      }
      case "XOR": {
        const ones = node.inputs.reduce((acc, id) => acc + ((values.get(id) ?? 0) === 1 ? 1 : 0), 0);
        values.set(node.id, ones % 2 === 1 ? 1 : 0);
        break;
      }
    }
  }
  return values;
}

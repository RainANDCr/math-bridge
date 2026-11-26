import type { CellValue } from "../boolean/model";
import { termToString, type Cube } from "./implicants";
import { pruneRedundantTerms } from "./division";
import type { MultiOutputResult } from "./multiOutput";

/**
 * 子表达式共享（代数因式分解）
 *
 * 两级 SOP 只允许共享「整个乘积项」：A·B·C 与 A·B·D 里的 A·B 虽然一样，
 * 但如果两个输出用的不是同一个完整的项，就没法共用。
 *
 * 因式分解把共享粒度降到「任意公共因子」：
 *
 *   F1 = A·B·C + A·B·D        →   T1 = A·B
 *   F2 = A·B·E                    T2 = C + D
 *                                 F1 = T1·T2
 *                                 F2 = T1·E
 *
 * 代价模型（必须说清楚，否则「省了」是假的）：
 *   · 文字数 = 因式形式里出现的每个文字/引用都算 1 次，共享节点只在定义处写一次
 *   · 门数   = 每个 and / or 节点各算一个门（多输入算一个）
 * 两个指标可能反向：因式分解常常减少文字、增加门（层数变深、延迟变大）。
 * 所以界面同时给出两个数，而不是只报一个「更优」。
 *
 * 算法分两阶段：
 *   1. 全局提取：在所有输出的所有乘积项上找公共文字子集，按收益从大到小逐个提取，
 *      提取出的子表达式成为命名节点（可跨输出共享）
 *   2. 单输出递归分解：对每个输出反复「提公因子 → 分组 → 递归」，
 *      相同子问题通过签名缓存复用同一个节点，形成 DAG 而不是树
 */

export interface FactoringInput {
  name: string;
  terms: Cube[];
  /** 原始真值表，用于自检；省略则跳过验证 */
  values?: CellValue[];
}

export interface FactorDefinition {
  name: string;
  op: "and" | "or";
  operands: string[];
  /** 人类可读形式，如 "T1·T2" 或 "C + D" */
  expression: string;
  /** 引用它的定义名或输出名 */
  consumers: string[];
  /** 是否被多个输出（直接或间接）用到 */
  shared: boolean;
}

export interface FactoredOutput {
  name: string;
  root: string;
  /** 完全展开后的表达式（括号按优先级） */
  expression: string;
  literals: number;
  gates: number;
}

export interface FormCost {
  /** AND / OR 门数（多输入算一个门） */
  gates: number;
  /** 门输入端子总数，即连线数 */
  wires: number;
  /** 其中直接接到输入变量的端子数（经典「文字数」） */
  literals: number;
}

export interface FactoringResult {
  definitions: FactorDefinition[];
  outputs: FactoredOutput[];
  twoLevel: FormCost & { terms: number };
  factored: FormCost;
  /** 合计成本 = 门数 + 连线数（面积代理，不含延迟） */
  twoLevelCost: number;
  factoredCost: number;
  /** 共享节点数（被两个及以上输出间接引用） */
  sharedNodes: number;
  notes: string[];
  isValid: boolean;
}

type Term = Set<string>;

interface Node {
  name: string;
  op: "and" | "or";
  operands: string[];
  /** 被引用的次数（含输出绑定） */
  uses: number;
}

const CONST0 = "0";
const CONST1 = "1";

/** 文字键：正向用变量名，反向加 ! 前缀 */
function literalKey(variable: string, negated: boolean): string {
  return negated ? `!${variable}` : variable;
}

function parseLiteral(key: string): { variable: string; negated: boolean } {
  return key.startsWith("!") ? { variable: key.slice(1), negated: true } : { variable: key, negated: false };
}

function isConst(ref: string): boolean {
  return ref === CONST0 || ref === CONST1;
}

function sortKey(term: Term): string {
  return [...term].sort().join("|");
}

function dedupeAndAbsorb(terms: Term[]): Term[] {
  const seen = new Set<string>();
  const unique: Term[] = [];
  for (const term of terms) {
    const key = sortKey(term);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(term);
  }
  // 吸收律：S ⊂ T ⇒ S + S·T = S，大项可以删掉
  return unique.filter(
    (term) =>
      !unique.some(
        (other) => other !== term && other.size < term.size && [...other].every((lit) => term.has(lit))
      )
  );
}

/** 提取公共因子 D 后，各项的剩余部分 */
function removeFrom(term: Term, divisor: Term): Term {
  const rest = new Set(term);
  for (const lit of divisor) rest.delete(lit);
  return rest;
}

function containsAll(term: Term, divisor: Term): boolean {
  for (const lit of divisor) if (!term.has(lit)) return false;
  return true;
}

function* subsetsOfSize(items: string[], size: number): Generator<string[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= items.length - size; i += 1) {
    for (const rest of subsetsOfSize(items.slice(i + 1), size - 1)) {
      yield [items[i], ...rest];
    }
  }
}

/** 因式分解的收益：k 个文字被 t 个项共用，能省几个文字 */
function divisorSaving(k: number, t: number): number {
  if (t < 2) return 0;
  // k=1 时不需要额外造与门，因子直接作为门的一个输入
  return k === 1 ? t - 1 : (k - 1) * (t - 1) - 1;
}

class FactorBuilder {
  private nodes: Node[] = [];
  private bySignature = new Map<string, string>();
  private counter = 0;

  /** 生成（或复用）一个 and / or 节点，返回引用 */
  make(op: "and" | "or", operands: string[]): string {
    // 互补律：X·¬X = 0，X + ¬X = 1。没有这一步，A·B·(C + ¬C) 会被白算成三个门
    for (const operand of operands) {
      const opposite = operand.startsWith("!") ? operand.slice(1) : `!${operand}`;
      if (operands.includes(opposite) && !isConst(operand)) {
        return op === "and" ? CONST0 : CONST1;
      }
    }

    const flat: string[] = [];
    const seen = new Set<string>();
    for (const operand of operands) {
      if (op === "and" && operand === CONST1) continue;
      if (op === "or" && operand === CONST0) continue;
      if (op === "and" && operand === CONST0) return CONST0;
      if (op === "or" && operand === CONST1) return CONST1;
      if (seen.has(operand)) continue;
      seen.add(operand);
      flat.push(operand);
    }

    if (flat.length === 0) return op === "and" ? CONST1 : CONST0;
    if (flat.length === 1) return flat[0];

    const sorted = [...flat].sort();
    const signature = `${op}(${sorted.join(",")})`;
    const existing = this.bySignature.get(signature);
    if (existing) {
      this.bump(existing);
      return existing;
    }

    this.counter += 1;
    const name = `T${this.counter}`;
    this.nodes.push({ name, op, operands: sorted, uses: 0 });
    this.bySignature.set(signature, name);
    for (const operand of sorted) this.bump(operand);
    return name;
  }

  private bump(ref: string) {
    if (isConst(ref) || !this.isNode(ref)) return;
    const node = this.nodes.find((item) => item.name === ref);
    if (node) node.uses += 1;
  }

  isNode(ref: string): boolean {
    return this.nodes.some((node) => node.name === ref);
  }

  getNodes(): Node[] {
    return this.nodes;
  }

  /**
   * 只被一个消费者使用的同类节点可以内联：
   *   T1 = A·B, T2 = T1·C  →  T2 = A·B·C（少一个门、少一个引用字面量）
   * 被共享的节点绝不能内联，否则共享就没了。
   */
  inlineSingleUse(protectedRefs: Set<string> = new Set()): void {
    let changed = true;
    let guard = 0;
    while (changed && guard < 50) {
      changed = false;
      guard += 1;
      for (const node of [...this.nodes]) {
        // 输出直接绑定的节点是「结果本身」，内联掉会让输出悬空
        if (node.uses !== 1 || protectedRefs.has(node.name)) continue;
        const consumer = this.nodes.find(
          (item) => item !== node && item.operands.includes(node.name)
        );
        if (!consumer || consumer.op !== node.op) continue;
        // 内联：把父节点里的引用替换成子节点的操作数
        const operands: string[] = [];
        for (const operand of consumer.operands) {
          if (operand === node.name) operands.push(...node.operands);
          else operands.push(operand);
        }
        consumer.operands = [...new Set(operands)].sort();
        this.nodes = this.nodes.filter((item) => item !== node);
        this.bySignature.clear();
        for (const item of this.nodes) {
          this.bySignature.set(`${item.op}(${item.operands.join(",")})`, item.name);
        }
        changed = true;
        break;
      }
    }
  }
}

function addUses(builder: FactorBuilder, ref: string, consumer: string, uses: Map<string, string[]>) {
  if (isConst(ref) || !builder.isNode(ref)) return;
  const list = uses.get(ref) ?? [];
  if (!list.includes(consumer)) list.push(consumer);
  uses.set(ref, list);
}

/** 递归分解一组乘积项，返回引用 */
function factorTerms(
  terms: Term[],
  builder: FactorBuilder,
  memo: Map<string, string>,
  depth = 0
): string {
  const normalized = dedupeAndAbsorb(terms);
  if (normalized.length === 0) return CONST0;

  const signature = normalized.map(sortKey).sort().join(";");
  const cached = memo.get(signature);
  if (cached) return cached;

  const remember = (ref: string) => {
    memo.set(signature, ref);
    return ref;
  };

  if (normalized.length === 1) {
    const term = normalized[0];
    if (term.size === 0) return remember(CONST1);
    if (term.size === 1) return remember([...term][0]);
    return remember(builder.make("and", [...term].sort()));
  }

  if (depth > 12) {
    return remember(builder.make("or", normalized.map((term) => builder.make("and", [...term].sort()))));
  }

  // 所有项都含有的文字：直接提到最外层
  const common = [...normalized[0]].filter((lit) => normalized.every((term) => term.has(lit)));
  if (common.length > 0) {
    const divisor: Term = new Set(common);
    const rest = normalized.map((term) => removeFrom(term, divisor));
    if (rest.some((term) => term.size === 0)) {
      // 有一项正好等于公因子本身 ⇒ 由吸收律，整体就是它
      return remember(builder.make("and", [...divisor].sort()));
    }
    const inner = factorTerms(rest, builder, memo, depth + 1);
    return remember(builder.make("and", [builder.make("and", [...divisor].sort()), inner]));
  }

  // 找收益最大的公因子（1~4 个文字）
  let best: { divisor: Term; saving: number } | null = null;
  for (const term of normalized) {
    const literals = [...term];
    const maxSize = Math.min(4, literals.length);
    for (let size = 1; size <= maxSize; size += 1) {
      for (const subset of subsetsOfSize(literals, size)) {
        const divisor: Term = new Set(subset);
        let count = 0;
        for (const other of normalized) if (containsAll(other, divisor)) count += 1;
        if (count < 2) continue;
        const saving = divisorSaving(size, count);
        if (saving <= 0) continue;
        if (!best || saving > best.saving) best = { divisor, saving };
      }
    }
  }

  if (best) {
    const group = normalized.filter((term) => containsAll(term, best!.divisor));
    const others = normalized.filter((term) => !containsAll(term, best!.divisor));
    const left = builder.make("and", [
      builder.make("and", [...best.divisor].sort()),
      factorTerms(group.map((term) => removeFrom(term, best!.divisor)), builder, memo, depth + 1),
    ]);
    const right = factorTerms(others, builder, memo, depth + 1);
    return remember(builder.make("or", [left, right]));
  }

  // 没有可提取的因子：老老实实写成与或式
  return remember(
    builder.make(
      "or",
      normalized.map((term) => builder.make("and", [...term].sort()))
    )
  );
}

/** 两阶段里的第一阶段：在所有输出、所有乘积项之间提取公共因子 */
function extractGlobalDivisors(
  outputs: Array<{ name: string; terms: Term[] }>,
  builder: FactorBuilder
): void {
  for (let step = 0; step < 40; step += 1) {
    const allTerms: Term[] = [];
    for (const output of outputs) for (const term of output.terms) allTerms.push(term);

    let best: { divisor: Term; saving: number; count: number } | null = null;
    const candidates = new Set<string>();

    for (const term of allTerms) {
      if (term.size < 2) continue;
      const literals = [...term];
      const maxSize = Math.min(4, literals.length);
      for (let size = 2; size <= maxSize; size += 1) {
        for (const subset of subsetsOfSize(literals, size)) {
          candidates.add([...subset].sort().join("|"));
        }
      }
    }

    for (const key of candidates) {
      const divisor: Term = new Set(key.split("|"));
      let count = 0;
      for (const term of allTerms) if (containsAll(term, divisor)) count += 1;
      if (count < 2) continue;
      const saving = divisorSaving(divisor.size, count);
      if (saving <= 0) continue;
      if (!best || saving > best.saving) best = { divisor, saving, count };
    }

    if (!best) return;
    const node = builder.make("and", [...best.divisor].sort());
    if (!builder.isNode(node)) return;

    for (const output of outputs) {
      output.terms = dedupeAndAbsorb(
        output.terms.map((term) => {
          if (!containsAll(term, best!.divisor)) return term;
          const rest = removeFrom(term, best!.divisor);
          rest.add(node);
          return rest;
        })
      );
    }
  }
}

function renderRef(ref: string, parentOp: "and" | "or" | null, nodes: Map<string, Node>): string {
  if (isConst(ref)) return ref;
  const node = nodes.get(ref);
  if (!node) {
    const { variable, negated } = parseLiteral(ref);
    return `${negated ? "¬" : ""}${variable}`;
  }
  const symbols = node.operands.map((operand) => renderRef(operand, node.op, nodes));
  const text = node.op === "and" ? symbols.join("·") : symbols.join(" + ");
  const needsParens = parentOp === "and" && node.op === "or";
  return needsParens ? `(${text})` : text;
}

function evaluateRef(
  ref: string,
  assignment: Map<string, 0 | 1>,
  nodes: Map<string, Node>,
  cache: Map<string, 0 | 1>
): 0 | 1 {
  if (ref === CONST0) return 0;
  if (ref === CONST1) return 1;
  const node = nodes.get(ref);
  if (!node) {
    const { variable, negated } = parseLiteral(ref);
    const value = assignment.get(variable) ?? 0;
    return (negated ? (value === 1 ? 0 : 1) : value) as 0 | 1;
  }
  const hit = cache.get(ref);
  if (hit !== undefined) return hit;
  const values = node.operands.map((operand) => evaluateRef(operand, assignment, nodes, cache));
  const value = (node.op === "and"
    ? values.every((v) => v === 1)
    : values.some((v) => v === 1))
    ? 1
    : 0;
  cache.set(ref, value as 0 | 1);
  return value as 0 | 1;
}

/**
 * 该引用及其全部子节点（用于判断共享节点服务了哪些输出）。
 * 必须把 ref 自己也放进去：某个输出的根就是共享节点时，
 * 它同样「被这个输出用到」。
 */
function descendants(ref: string, nodes: Map<string, Node>, acc = new Set<string>()): Set<string> {
  const node = nodes.get(ref);
  if (!node) return acc;
  if (!acc.has(ref)) acc.add(ref);
  for (const operand of node.operands) {
    if (nodes.has(operand) && !acc.has(operand)) {
      acc.add(operand);
      descendants(operand, nodes, acc);
    }
  }
  return acc;
}

export function factorExpressions(variables: string[], outputs: FactoringInput[]): FactoringResult {
  const notes: string[] = [];

  const literalSets = outputs.map((output) => {
    // 先去掉被同输出其他项完全覆盖的共识项：它们不改变函数，
    // 却会挡住「删掉之后才出现」的公因子
    let terms = output.terms;
    if (output.values) {
      const pruned = pruneRedundantTerms(variables, output.values, terms);
      if (pruned.removed.length > 0) {
        notes.push(
          `${output.name} 消去 ${pruned.removed.length} 个冗余项（${pruned.removed
            .map((item) => item.text)
            .join("、")}）后再分解`
        );
        terms = pruned.terms;
      }
    }
    return terms.map(
      (term) => new Set(term.literals.map((lit) => literalKey(lit.variable, lit.negated)))
    );
  });

  const buildFactored = (): { builder: FactorBuilder; roots: string[] } => {
    const builder = new FactorBuilder();
    const working = outputs.map((output, index) => ({
      name: output.name,
      terms: literalSets[index].map((term) => new Set(term)),
    }));
    extractGlobalDivisors(working, builder);
    const memo = new Map<string, string>();
    const roots = working.map((output) => factorTerms(output.terms, builder, memo));
    builder.inlineSingleUse(new Set(roots));
    return { builder, roots };
  };

  const buildPlain = () => {
    const builder = new FactorBuilder();
    const roots = literalSets.map((terms) =>
      builder.make(
        "or",
        terms.map((term) => builder.make("and", [...term].sort()))
      )
    );
    return { builder, roots };
  };

  /**
   * 两级形式的基准成本。
   *
   * 两个容易算错的地方：
   *   1. 相同乘积项在两个输出里出现时，物理上只造一个与门 —— 必须去重
   *   2. 单项乘积（如 C）不需要与门，它就是一根线
   * 不按这两条算，会把基准抬高，从而虚报因式分解的收益。
   */
  const uniqueTerms = new Map<string, number>();
  for (const output of outputs) {
    for (const term of output.terms) {
      const key = term.literals
        .map((literal) => literalKey(literal.variable, literal.negated))
        .sort()
        .join("|");
      if (!uniqueTerms.has(key)) uniqueTerms.set(key, term.literals.length);
    }
  }
  const multiLiteralTerms = [...uniqueTerms.values()].filter((size) => size >= 2);
  const twoLevelTerms = uniqueTerms.size;
  const twoLevelLiterals = [...uniqueTerms.values()].reduce((acc, size) => acc + size, 0);
  const twoLevelGates =
    multiLiteralTerms.length + outputs.filter((output) => output.terms.length >= 2).length;
  const twoLevelWires =
    multiLiteralTerms.reduce((acc, size) => acc + size, 0) +
    outputs.reduce((acc, output) => {
      if (output.terms.length >= 2) return acc + output.terms.length;
      // 单项输出：多文字项的输出直接取自与门，不再多一根线；单文字项则是一根直连线
      if (output.terms.length === 1 && output.terms[0].literals.length === 1) return acc + 1;
      return acc;
    }, 0);
  const twoLevel: FormCost & { terms: number } = {
    gates: twoLevelGates,
    wires: twoLevelWires,
    literals: twoLevelLiterals,
    terms: twoLevelTerms,
  };

  /**
   * 两种形式用同一套统计：
   *   门数   = and / or 节点数
   *   连线数 = 所有门输入端子之和（+ 输出直接取自某个字面量时那 1 根线）
   *   文字数 = 其中接到输入变量的端子（经典定义，仅作参考）
   */
  const countForm = (builder: FactorBuilder, roots: string[]): FormCost => {
    const nodes = builder.getNodes();
    const names = new Set(nodes.map((node) => node.name));
    let gates = nodes.length;
    let wires = 0;
    let literals = 0;
    for (const node of nodes) {
      wires += node.operands.length;
      for (const operand of node.operands) {
        if (!names.has(operand) && !isConst(operand)) literals += 1;
      }
    }
    for (const root of roots) {
      if (!names.has(root) && !isConst(root)) {
        // 输出直接取自一个变量/取反变量：没有门，只有一根线
        wires += 1;
        literals += 1;
        gates += 0;
      }
    }
    return { gates, wires, literals };
  };

  // 先试因式分解；如果反而更贵，就退回两级形式 —— 不做亏本买卖
  const twoLevelCost = twoLevelGates + twoLevelWires;
  let attempt = buildFactored();
  let factored = countForm(attempt.builder, attempt.roots);
  if (factored.gates + factored.wires > twoLevelCost) {
    attempt = buildPlain();
    factored = countForm(attempt.builder, attempt.roots);
    notes.push("没有找到划算的公共因子，已退回两级与或式");
  }

  const builder = attempt.builder;
  const roots = attempt.roots;
  const workingNames = outputs.map((output, index) => ({
    name: output.name,
    values: output.values,
    terms: literalSets[index],
  }));

  const nodeList = builder.getNodes();
  const nodeMap = new Map(nodeList.map((node) => [node.name, node]));


  // —— 消费者与共享标记 ——
  const uses = new Map<string, string[]>();
  workingNames.forEach((output, index) => addUses(builder, roots[index], output.name, uses));
  for (const node of nodeList) {
    for (const operand of node.operands) addUses(builder, operand, node.name, uses);
  }

  const outputDescendants = workingNames.map((_, index) => descendants(roots[index], nodeMap));
  const sharedNodes = nodeList.filter((node) => {
    let served = 0;
    for (const set of outputDescendants) if (set.has(node.name)) served += 1;
    return served >= 2;
  }).length;

  const definitions: FactorDefinition[] = nodeList.map((node) => {
    // 定义序列是「网表」而不是展开式：操作数是节点时直接写节点名，
    // 否则 T3 = T1·T2 会被展开成 T3 = A·B·(C + D)，看不出它在复用 T1
    const symbols = node.operands.map((operand) => {
      if (nodeMap.has(operand)) return operand;
      if (isConst(operand)) return operand;
      const { variable, negated } = parseLiteral(operand);
      return `${negated ? "¬" : ""}${variable}`;
    });
    return {
      name: node.name,
      op: node.op,
      operands: node.operands,
      expression: node.op === "and" ? symbols.join("·") : symbols.join(" + "),
      consumers: uses.get(node.name) ?? [],
      shared: outputDescendants.filter((set) => set.has(node.name)).length >= 2,
    };
  });

  const factoredOutputs: FactoredOutput[] = workingNames.map((output, index) => {
    const root = roots[index];
    const own = descendants(root, nodeMap);
    own.add(root);
    return {
      name: output.name,
      root,
      expression: renderRef(root, null, nodeMap),
      literals: nodeList
        .filter((node) => own.has(node.name))
        .reduce((acc, node) => acc + node.operands.length, 0),
      gates: nodeList.filter((node) => own.has(node.name)).length,
    };
  });

  // —— 自检：把定义按输入组合求值，必须还原每个输出 ——
  let isValid = true;
  let checkedRows = 0;
  const total = 1 << variables.length;
  for (let index = 0; index < workingNames.length; index += 1) {
    const spec = workingNames[index];
    if (!spec.values) continue;
    for (let row = 0; row < total; row += 1) {
      const expected = spec.values[row];
      if (expected === "X") continue;
      checkedRows += 1;
      const assignment = new Map<string, 0 | 1>();
      variables.forEach((variable, bit) => {
        assignment.set(variable, ((row >> (variables.length - 1 - bit)) & 1) as 0 | 1);
      });
      const actual = evaluateRef(roots[index], assignment, nodeMap, new Map());
      if (actual !== (expected === 1 ? 1 : 0)) {
        isValid = false;
        notes.push(`${spec.name} 在第 ${row} 行求值不符：期望 ${expected}，得到 ${actual}`);
        break;
      }
    }
  }

  if (checkedRows === 0 && outputs.some((output) => output.values)) {
    notes.push("所有格子都是无关项，无需比较");
  }

  const factoredCost = factored.gates + factored.wires;
  const saved = twoLevelCost - factoredCost;
  if (saved > 0) {
    notes.push(`合计成本从 ${twoLevelCost} 降到 ${factoredCost}，省 ${saved} 个（门 + 连线）`);
  } else if (saved === 0) {
    notes.push("合计成本与两级 SOP 持平：这些输出之间没有值得提取的公共因子");
  }

  return {
    definitions,
    outputs: factoredOutputs,
    twoLevel,
    factored,
    twoLevelCost,
    factoredCost,
    sharedNodes,
    notes,
    isValid,
  };
}

/** 从多输出化简的结果直接做因式分解 */
export function factorMultiOutput(variables: string[], multi: MultiOutputResult): FactoringResult {
  const outputs: FactoringInput[] = multi.perOutput.map((output, index) => ({
    name: output.name,
    terms: multi.terms
      .filter((term) => term.outputs.includes(index))
      .map((term) => term.cube),
  }));
  return factorExpressions(variables, outputs);
}

/** 给界面用的轻量预览：把乘积项写成文字串 */
export function termsToExpression(terms: Cube[]): string {
  if (terms.length === 0) return "0";
  if (terms.some((term) => term.literals.length === 0)) return "1";
  return terms.map((term) => termToString(term.literals)).join(" + ");
}

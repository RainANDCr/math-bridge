import type { CellValue } from "../boolean/model";
import { evaluateSopAt, minimizeValues, type MinimizeResult } from "../karnaugh/minimizer";

/**
 * 时序逻辑：状态转移表 → 触发器激励方程
 *
 * 三种正交的选择，组合起来就是「同一台机器」的不同实现：
 *   · 输出模型：Moore（Z 只与状态有关） / Mealy（Z 与状态和输入都有关）
 *   · 触发器：D（D = 次态） / JK（由激励表反推 J、K，未用到的组合是无关项）
 *   · 状态编码：二进制（位宽最小） / one-hot（每态一位）
 *
 * 关键点：这里没有任何新的化简算法 —— 把状态转移表按「状态位 × 输入」
 * 展开成真值表，交给卡诺图那套精确最小化。时序电路和组合电路在这里合流。
 *
 * 位宽由「码字」反推而不是由「状态数」直接算：
 * 二进制 n 个状态取 ceil(log2 n) 位，空出来的码是无关项；
 * one-hot 直接把状态 s 编成第 s 位为 1，位宽就是 n。
 * 这样两种编码走同一条推导路径，代价才有可比性。
 */

export type MachineType = "moore" | "mealy";
export type FlipFlopType = "D" | "JK";
export type EncodingScheme = "binary" | "onehot";

export interface StateMachine {
  /** 状态数；化简后可能是 1 或 3，不再限定 2/4 */
  stateCount: number;
  /** transitions[state][input] = nextState */
  transitions: number[][];
  inputName: string;
  /**
   * Moore 型：outputs[state] = 0 | 1
   * Mealy 型：outputs[state][input] = 0 | 1
   */
  outputs: number[] | number[][];
  /** 缺省 Moore */
  machineType?: MachineType;
  /** 缺省 D */
  flipFlop?: FlipFlopType;
  /** 二进制编码的具体分配；必须是互不相同的合法码。one-hot 时忽略 */
  stateCodes?: number[];
  /** 编码方案，缺省 binary */
  encoding?: EncodingScheme;
}

export interface Equation {
  variable: string;
  values: CellValue[];
  result: MinimizeResult;
}

export interface ExcitationRow {
  q: 0 | 1;
  next: 0 | 1;
  j: 0 | 1 | "X";
  k: 0 | 1 | "X";
}

export interface BitDesign {
  /** 状态位下标，0 为最高位 */
  bit: number;
  qVariable: string;
  nextValues: CellValue[];
  /** D 型方程 */
  d?: Equation;
  /** JK 型方程 */
  j?: Equation;
  k?: Equation;
  /** 该位实际用到的 (Q, Q+) → (J, K) 组合 */
  excitation: ExcitationRow[];
}

export interface SequentialDerivation {
  stateBits: number;
  stateVariables: string[];
  /** 次态方程的输入变量，如 ["Q1","Q0","X"] */
  variables: string[];
  machineType: MachineType;
  flipFlop: FlipFlopType;
  encoding: EncodingScheme;
  /** codes[state] = 编码值 */
  codes: number[];
  bits: BitDesign[];
  output: {
    variable: string;
    variables: string[];
    values: CellValue[];
    result: MinimizeResult;
    /** Mealy 型的输出方程含输入变量 */
    dependsOnInput: boolean;
  };
  /** 所有方程（D 型每字 1 条，JK 型每字 2 条），供统一展示与计价 */
  equations: Equation[];
  totalLiterals: number;
  totalTerms: number;
  reachable: number[];
  unreachable: number[];
  warnings: string[];
}

export function machineTypeOf(machine: StateMachine): MachineType {
  return machine.machineType === "mealy" ? "mealy" : "moore";
}

export function flipFlopOf(machine: StateMachine): FlipFlopType {
  return machine.flipFlop === "JK" ? "JK" : "D";
}

export function encodingOf(machine: StateMachine): EncodingScheme {
  return machine.encoding === "onehot" ? "onehot" : "binary";
}

/** 二进制编码至少需要几位；1 个状态不需要状态位 */
export function stateBitsOf(stateCount: number): number {
  if (stateCount <= 1) return 0;
  return Math.ceil(Math.log2(stateCount));
}

/** 一组码字实际占用的位宽：由最大码字反推 */
export function bitsOfCodes(codes: number[]): number {
  const max = codes.reduce((acc, code) => Math.max(acc, code), 0);
  return max === 0 ? 0 : Math.floor(Math.log2(max)) + 1;
}

/**
 * one-hot：状态 s 占第 (n-1-s) 位。
 * 只有 1 个状态时没有可区分的东西，退化成 0 位（与二进制一致），
 * 否则会凭空多出一个「恒等于 1」的触发器。
 */
export function oneHotCodes(stateCount: number): number[] {
  if (stateCount <= 1) return [0];
  return Array.from({ length: stateCount }, (_, state) => 1 << (stateCount - 1 - state));
}

/** 状态编码的二进制串，如 3 → "11"；0 位时返回空串 */
export function stateCode(state: number, stateBits: number): string {
  if (stateBits <= 0) return "";
  return state.toString(2).padStart(stateBits, "0");
}

/** 取该状态当前的编码值（考虑自定义编码与 one-hot） */
export function codeOf(machine: StateMachine, state: number): number {
  const codes = stateCodesOf(machine);
  return codes[state] ?? state;
}

/**
 * 校验并规范化编码：
 * binary —— 必须是 2^b 个码字中挑 n 个互不相同的（允许留空码作为无关项）；
 * one-hot —— 由状态数直接生成，不接受自定义。
 */
export function stateCodesOf(machine: StateMachine): number[] {
  const n = machine.stateCount;
  if (encodingOf(machine) === "onehot") return oneHotCodes(n);

  const capacity = 1 << stateBitsOf(n);
  const raw = machine.stateCodes;
  if (Array.isArray(raw) && raw.length === n) {
    const seen = new Set<number>();
    let valid = true;
    for (const value of raw) {
      if (!Number.isInteger(value) || value < 0 || value >= capacity || seen.has(value)) {
        valid = false;
        break;
      }
      seen.add(value);
    }
    if (valid) return raw.slice();
  }
  return Array.from({ length: n }, (_, i) => i);
}

/** 输出值：Moore 忽略输入，Mealy 依赖输入 */
export function outputAt(machine: StateMachine, state: number, input: number): 0 | 1 {
  if (machineTypeOf(machine) === "mealy") {
    const row = machine.outputs[state];
    if (Array.isArray(row)) return Number(row[input]) === 1 ? 1 : 0;
    return 0;
  }
  const value = machine.outputs[state];
  return Number(Array.isArray(value) ? value[0] : value) === 1 ? 1 : 0;
}

/** 把任意形状的 outputs 归一成 [state][input]，方便读写 */
export function outputMatrix(machine: StateMachine): Array<Array<0 | 1>> {
  return Array.from({ length: machine.stateCount }, (_, state) =>
    Array.from({ length: 2 }, (_, input) => outputAt(machine, state, input))
  );
}

export function nextStateOf(machine: StateMachine, state: number, input: number): number {
  const next = machine.transitions[state]?.[input];
  return Number.isInteger(next) && next >= 0 && next < machine.stateCount ? next : 0;
}

/** JK 激励表：由 Q → Q+ 反推所需要的 J、K；无关项记作 X */
export function excitationOf(q: 0 | 1, next: 0 | 1): { j: 0 | 1 | "X"; k: 0 | 1 | "X" } {
  if (q === 0 && next === 0) return { j: 0, k: "X" };
  if (q === 0 && next === 1) return { j: 1, k: "X" };
  if (q === 1 && next === 0) return { j: "X", k: 1 };
  return { j: "X", k: 0 };
}

export function deriveSequential(machine: StateMachine): SequentialDerivation {
  const encoding = encodingOf(machine);
  const codes = stateCodesOf(machine);
  const stateBits = bitsOfCodes(codes);
  /** 二进制编码下 2^stateBits 是码字空间，多出来的码是无关项；one-hot 下等于状态数 */
  const capacity = 1 << stateBits;
  const stateVariables = Array.from({ length: stateBits }, (_, i) => `Q${stateBits - 1 - i}`);
  const variables = [...stateVariables, machine.inputName];
  const machineType = machineTypeOf(machine);
  const flipFlop = flipFlopOf(machine);

  const codeToState = new Map<number, number>();
  codes.forEach((code, state) => codeToState.set(code, state));

  const warnings: string[] = [];
  const rows = capacity * 2;

  // —— 次态：每个状态位一张（D）或两张（JK）真值表 ——
  const bits: BitDesign[] = [];
  for (let bit = 0; bit < stateBits; bit += 1) {
    const shift = stateBits - 1 - bit;
    const nextValues: CellValue[] = new Array(rows).fill("X");
    const jValues: CellValue[] = new Array(rows).fill("X");
    const kValues: CellValue[] = new Array(rows).fill("X");
    const seen = new Map<string, ExcitationRow>();

    for (let code = 0; code < capacity; code += 1) {
      const state = codeToState.get(code);
      // 没有状态对应的码不会出现，整行是无关项
      if (state === undefined) continue;
      for (let input = 0; input <= 1; input += 1) {
        const row = code * 2 + input;
        const nextCode = codes[nextStateOf(machine, state, input)];
        const q = ((code >> shift) & 1) as 0 | 1;
        const next = ((nextCode >> shift) & 1) as 0 | 1;

        nextValues[row] = next;
        const excitation = excitationOf(q, next);
        jValues[row] = excitation.j;
        kValues[row] = excitation.k;
        const key = `${q}${next}`;
        if (!seen.has(key)) seen.set(key, { q, next, j: excitation.j, k: excitation.k });
      }
    }

    const qVariable = `Q${shift}`;
    if (flipFlop === "D") {
      bits.push({
        bit,
        qVariable,
        nextValues,
        d: {
          variable: `D${shift}`,
          values: nextValues,
          result: minimizeValues(variables, nextValues),
        },
        excitation: [...seen.values()].sort((a, b) => a.q - b.q || a.next - b.next),
      });
    } else {
      bits.push({
        bit,
        qVariable,
        nextValues,
        j: {
          variable: `J${shift}`,
          values: jValues,
          result: minimizeValues(variables, jValues),
        },
        k: {
          variable: `K${shift}`,
          values: kValues,
          result: minimizeValues(variables, kValues),
        },
        excitation: [...seen.values()].sort((a, b) => a.q - b.q || a.next - b.next),
      });
    }
  }

  // —— 输出 ——
  const outputVariables = machineType === "mealy" ? variables : stateVariables;
  const outputValues: CellValue[] =
    machineType === "mealy"
      ? Array.from({ length: rows }, (_, row) => {
          const state = codeToState.get(row >> 1);
          return state === undefined ? "X" : outputAt(machine, state, row & 1);
        })
      : Array.from({ length: capacity }, (_, code) => {
          const state = codeToState.get(code);
          return state === undefined ? "X" : outputAt(machine, state, 0);
        });

  const outputResult = minimizeValues(outputVariables, outputValues);
  const output: SequentialDerivation["output"] = {
    variable: "Z",
    variables: outputVariables,
    values: outputValues,
    result: outputResult,
    dependsOnInput: machineType === "mealy",
  };

  // —— 可达性 ——
  const reachable: number[] = [0];
  const seenStates = new Set<number>([0]);
  for (let i = 0; i < reachable.length; i += 1) {
    const state = reachable[i];
    for (let input = 0; input <= 1; input += 1) {
      const next = nextStateOf(machine, state, input);
      if (!seenStates.has(next)) {
        seenStates.add(next);
        reachable.push(next);
      }
    }
  }
  const unreachable = Array.from({ length: machine.stateCount }, (_, i) => i).filter(
    (state) => !seenStates.has(state)
  );

  if (unreachable.length > 0) {
    warnings.push(
      `${unreachable.map((s) => `S${s}`).join("、")} 从 S0 出发不可达：它的转移仍是电路的一部分，别把它写成无关项`
    );
  }

  const equations: Equation[] = [];
  for (const bitDesign of bits) {
    if (bitDesign.d) equations.push(bitDesign.d);
    if (bitDesign.j) equations.push(bitDesign.j);
    if (bitDesign.k) equations.push(bitDesign.k);
  }
  equations.push({
    variable: output.variable,
    values: output.values,
    result: output.result,
  });

  const totalLiterals = equations.reduce((acc, item) => acc + item.result.literalCount, 0);
  const totalTerms = equations.reduce((acc, item) => acc + item.result.termCount, 0);

  return {
    stateBits,
    stateVariables,
    variables,
    machineType,
    flipFlop,
    encoding,
    codes,
    bits,
    output,
    equations,
    totalLiterals,
    totalTerms,
    reachable,
    unreachable,
    warnings,
  };
}

/** 走一拍 */
export function stepState(machine: StateMachine, state: number, input: number): number {
  return nextStateOf(machine, state, input);
}

export interface StepRecord {
  from: number;
  input: number;
  to: number;
  /** 该拍的输出：Moore 只看旧状态，Mealy 看旧状态与当前输入 */
  output: 0 | 1;
}

export function runSteps(
  machine: StateMachine,
  start: number,
  inputs: number[]
): { steps: StepRecord[]; final: number } {
  let state = start;
  const steps: StepRecord[] = [];
  for (const input of inputs) {
    const to = nextStateOf(machine, state, input);
    steps.push({ from: state, input, to, output: outputAt(machine, state, input) });
    state = to;
  }
  return { steps, final: state };
}

/**
 * 自检：把方程重新代回每一行，看能否还原转移表与输出表。
 *
 * D 型：Q+ 直接就是 D 的取值。
 * JK 型：必须按特性方程 Q+ = J·¬Q + ¬K·Q 计算 —— 这才是「激励表推出来的
 *        方程真的能让触发器走到该去的地方」的证明，光比对 J/K 表不算。
 *
 * 遍历的是「被分配的码字」，不是 0..n-1：one-hot 的码字是 8/4/2/1，
 * 二进制编码可能空出某个码，两者都不能用序号当码。
 */
/**
 * 在某个最小项上求值。
 *
 * 常量 1 的最简式没有乘积项（`terms` 为空、`expression` 为 "1"），
 * 直接交给 evaluateSopAt 会得到 false —— 0 变量的机器（1 个状态）必然踩到。
 */
function holdsAt(result: MinimizeResult, variables: string[], index: number): boolean {
  if (result.terms.length === 0) return result.expression === "1";
  return evaluateSopAt(variables, result.terms, index);
}

export function verifyDerivation(machine: StateMachine, derivation: SequentialDerivation): boolean {
  const { stateBits, codes, variables } = derivation;

  for (let state = 0; state < machine.stateCount; state += 1) {
    const code = codes[state];
    for (let input = 0; input <= 1; input += 1) {
      const row = code * 2 + input;

      let actualCode = 0;
      for (let bit = 0; bit < stateBits; bit += 1) {
        const design = derivation.bits[bit];
        let qNext: number;
        if (design.d) {
          qNext = holdsAt(design.d.result, variables, row) ? 1 : 0;
        } else {
          const q = (code >> (stateBits - 1 - bit)) & 1;
          const j = holdsAt(design.j!.result, variables, row) ? 1 : 0;
          const k = holdsAt(design.k!.result, variables, row) ? 1 : 0;
          qNext = (j & (1 - q)) | ((1 - k) & q);
        }
        actualCode = (actualCode << 1) | qNext;
      }

      if (actualCode !== codes[nextStateOf(machine, state, input)]) return false;

      const expectedOutput = outputAt(machine, state, input);
      // Moore 的输出方程只以状态位为变量，行号是编码值而不是「编码·输入」
      const outputRow = derivation.output.dependsOnInput ? row : code;
      const actualOutput = holdsAt(derivation.output.result, derivation.output.variables, outputRow)
        ? 1
        : 0;
      if (actualOutput !== expectedOutput) return false;
    }
  }
  return true;
}

// —— 状态编码优化 ——

export interface EncodingCandidate {
  codes: number[];
  label: string;
  literals: number;
  terms: number;
  isCurrent: boolean;
}

export interface EncodingSearch {
  candidates: EncodingCandidate[];
  /** 搜索过的编码分配总数 */
  total: number;
  /** 码字空间大小 2^b */
  capacity: number;
  /** 当前编码的代价 */
  baseline: number;
  /** 最优代价 */
  best: number;
  /** 当前编码是否已是最优 */
  optimal: boolean;
}

/** 位宽由码字本身决定，因此 machine 参数只用于保持调用处可读 */
export function describeEncoding(_machine: StateMachine, codes: number[]): string {
  const bits = bitsOfCodes(codes);
  return codes
    .map((code, state) => `S${state}=${bits === 0 ? "—" : stateCode(code, bits)}`)
    .join(" · ");
}

/**
 * 把 n 个状态放进 capacity 个码字里，按顺序挑选（P(capacity, n)）。
 * 二进制编码下「哪个码空着」也是设计变量，必须一起穷举。
 */
function assignments(n: number, capacity: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];
  const used = new Array<boolean>(capacity).fill(false);
  const walk = () => {
    if (current.length === n) {
      result.push([...current]);
      return;
    }
    for (let code = 0; code < capacity; code += 1) {
      if (used[code]) continue;
      used[code] = true;
      current.push(code);
      walk();
      current.pop();
      used[code] = false;
    }
  };
  walk();
  return result;
}

/**
 * 穷举全部编码分配，按「总文字数、总乘积项数」排序。
 *
 * 4 状态 2 位：24 种；3 状态 2 位：4 个码挑 3 个 = 24 种；
 * 2 状态：2 种 —— 全部真算一遍，不是启发式。
 */
export function searchEncodings(machine: StateMachine, limit = 5): EncodingSearch {
  const base: StateMachine = { ...machine, encoding: "binary" };
  const capacity = 1 << stateBitsOf(base.stateCount);
  const all = assignments(base.stateCount, capacity);
  const current = stateCodesOf(base);
  const baseline = deriveSequential(base).totalLiterals;

  const scored = all.map((codes) => {
    const derived = deriveSequential({ ...base, stateCodes: codes });
    return {
      codes,
      label: describeEncoding(base, codes),
      literals: derived.totalLiterals,
      terms: derived.totalTerms,
      isCurrent: codes.every((code, i) => code === current[i]),
    };
  });

  scored.sort((a, b) => a.literals - b.literals || a.terms - b.terms);
  const best = scored[0]?.literals ?? baseline;

  // 保留前几名；若当前编码不在其中，补在末尾，方便对照
  const top = scored.slice(0, limit);
  if (!top.some((item) => item.isCurrent)) {
    const currentItem = scored.find((item) => item.isCurrent);
    if (currentItem) top.push(currentItem);
  }

  return {
    candidates: top,
    total: all.length,
    capacity,
    baseline,
    best,
    optimal: baseline === best,
  };
}

import {
  encodingOf,
  machineTypeOf,
  nextStateOf,
  outputAt,
  stateBitsOf,
  type StateMachine,
} from "./machine";

/**
 * 状态化简（等价状态合并）
 *
 * 教材流程里这一步夹在「状态表」和「状态编码」之间，很容易被跳过：
 * 两个状态如果对**任意输入序列**都给出相同的输出序列，它们在电路里就是同一个状态，
 * 没有必要各配一个触发器。
 *
 * 算法是划分细化（partition refinement），不是启发式：
 *   1. 先按输出分组 —— 输出不同的状态一定不等价
 *   2. 反复检查：同一组内，若某个输入下的次态落在不同组，就拆开
 *   3. 直到没有任何组再分裂，剩下的每组就是一个等价类
 *
 * Moore 与 Mealy 的区别只在第 1 步：
 * Moore 的状态输出是一个值，Mealy 的输出随输入变化，所以要按
 * 「X=0 时的输出、X=1 时的输出」这个二元组分组。
 */

export interface ReductionRound {
  index: number;
  title: string;
  blocks: number[][];
  note: string;
}

export interface StateReduction {
  originalCount: number;
  originalBits: number;
  /** 最终等价类，每类内的原始状态索引 */
  blocks: number[][];
  blockOf: number[];
  /** 每一轮的分组，用于展示推导过程 */
  rounds: ReductionRound[];
  merged: StateMachine;
  mergedCount: number;
  mergedBits: number;
  changed: boolean;
  /** 穷举输入序列的比对结果 */
  verified: boolean;
  /** 比对过的序列条数 */
  sequences: number;
  /** 比对的最大序列长度 */
  depth: number;
}

function listStates(states: number[]): string {
  return states.map((state) => `S${state}`).join("、");
}

/** 初始分组：输出（或输出二元组）相同的放一起 */
function initialBlocks(machine: StateMachine): number[][] {
  const groups = new Map<string, number[]>();
  for (let state = 0; state < machine.stateCount; state += 1) {
    const key =
      machineTypeOf(machine) === "mealy"
        ? `${outputAt(machine, state, 0)}${outputAt(machine, state, 1)}`
        : `${outputAt(machine, state, 0)}`;
    const hit = groups.get(key);
    if (hit) hit.push(state);
    else groups.set(key, [state]);
  }
  return [...groups.values()]
    .map((block) => [...block].sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

interface SplitInfo {
  block: number[];
  /** 块内哪些输入会让次态落入不同的组 */
  inputs: number[];
  parts: number[][];
}

function refine(
  machine: StateMachine,
  blocks: number[][],
  blockOf: number[]
): { blocks: number[][]; splits: SplitInfo[] } {
  const next: number[][] = [];
  const splits: SplitInfo[] = [];

  for (const block of blocks) {
    const groups = new Map<string, number[]>();
    for (const state of block) {
      // 次态所属的「组」才是等价意义的载体，次态编号本身不是
      const key = [0, 1].map((input) => blockOf[nextStateOf(machine, state, input)]).join(",");
      const hit = groups.get(key);
      if (hit) hit.push(state);
      else groups.set(key, [state]);
    }

    if (groups.size === 1) {
      next.push(block);
      continue;
    }

    const parts = [...groups.values()]
      .map((part) => [...part].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);

    const inputs = [0, 1].filter((input) => {
      const seen = new Set(block.map((state) => blockOf[nextStateOf(machine, state, input)]));
      return seen.size > 1;
    });

    splits.push({ block, inputs, parts });
    next.push(...parts);
  }

  next.sort((a, b) => a[0] - b[0]);
  return { blocks: next, splits };
}

/** 从 S0 出发跑一条输入序列，返回每一拍的输出 */
function outputSequence(machine: StateMachine, inputs: number[]): number[] {
  let state = 0;
  const out: number[] = [];
  for (const input of inputs) {
    out.push(outputAt(machine, state, input));
    state = nextStateOf(machine, state, input);
  }
  if (machineTypeOf(machine) === "moore") out.push(outputAt(machine, state, 0));
  return out;
}

/**
 * 穷举长度 ≤ depth 的全部输入序列，逐拍比对输出。
 *
 * depth 取原状态数就够了：若两个状态能被区分，最短区分序列的长度不超过状态数
 * —— 再长的序列若还能区分，前 n 拍就会先分开。
 */
export function compareBehavior(
  a: StateMachine,
  b: StateMachine,
  depth: number
): { ok: boolean; sequences: number } {
  let sequences = 0;
  for (let length = 0; length <= depth; length += 1) {
    for (let mask = 0; mask < 1 << length; mask += 1) {
      const inputs: number[] = [];
      for (let i = 0; i < length; i += 1) inputs.push((mask >> (length - 1 - i)) & 1);
      sequences += 1;

      const left = outputSequence(a, inputs);
      const right = outputSequence(b, inputs);
      if (left.length !== right.length) return { ok: false, sequences };
      for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) return { ok: false, sequences };
      }
    }
  }
  return { ok: true, sequences };
}

export function reduceMachine(machine: StateMachine): StateReduction {
  const originalCount = machine.stateCount;
  const blocks0 = initialBlocks(machine);

  const rounds: ReductionRound[] = [];
  const mealy = machineTypeOf(machine) === "mealy";
  rounds.push({
    index: 0,
    title: "第 0 轮 · 按输出分组",
    blocks: blocks0,
    note:
      originalCount === 1
        ? "只有 1 个状态，没有可合并的对象。"
        : mealy
        ? `Mealy 的输出随输入变化，按「${machine.inputName}=0 时的 Z、${machine.inputName}=1 时的 Z」分组：${blocks0
            .map((block) => `{${listStates(block)}}`)
            .join("、")}。输出组合不同的状态一定不等价。`
        : `Moore 的输出只看状态，按 Z 分组：${blocks0
            .map((block) => `{${listStates(block)}}（Z=${outputAt(machine, block[0], 0)}）`)
            .join("、")}。输出不同的状态一定不等价。`,
  });

  let blocks = blocks0;
  const blockOf: number[] = new Array(originalCount).fill(0);
  const indexBlocks = (list: number[][]) => {
    list.forEach((block, index) => block.forEach((state) => (blockOf[state] = index)));
  };
  indexBlocks(blocks);

  let guard = 0;
  while (guard <= originalCount) {
    guard += 1;
    const { blocks: nextBlocks, splits } = refine(machine, blocks, blockOf);
    if (splits.length === 0) break;

    blocks = nextBlocks;
    indexBlocks(blocks);
    rounds.push({
      index: rounds.length,
      title: `第 ${rounds.length} 轮 · 按次态所在组细分`,
      blocks,
      note: splits
        .map(
          (split) =>
            `{${listStates(split.block)}} 在 ${split.inputs
              .map((input) => `${machine.inputName}=${input}`)
              .join(" 与 ")} 上的次态落入不同组，拆成 ${split.parts
              .map((part) => `{${listStates(part)}}`)
              .join("、")}`
        )
        .join("；"),
    });
  }

  const mergedTransitions = blocks.map((block) =>
    [0, 1].map((input) => blockOf[nextStateOf(machine, block[0], input)])
  );
  const mergedOutputs: number[] | number[][] = mealy
    ? blocks.map((block) => [0, 1].map((input) => outputAt(machine, block[0], input)))
    : blocks.map((block) => outputAt(machine, block[0], 0));

  const merged: StateMachine = {
    stateCount: blocks.length,
    transitions: mergedTransitions,
    outputs: mergedOutputs,
    machineType: machineTypeOf(machine),
    flipFlop: machine.flipFlop,
    inputName: machine.inputName,
    // 保留用户当前的编码方案：化简改变的是状态图，不该顺手把 one-hot 打回二进制
    encoding: encodingOf(machine),
  };

  // 只有真的合并了才需要比对：未变化时两边是同一张表
  const depth = originalCount;
  const comparison =
    blocks.length === originalCount
      ? { ok: true, sequences: 0 }
      : compareBehavior(machine, merged, depth);

  return {
    originalCount,
    originalBits: stateBitsOf(originalCount),
    blocks,
    blockOf,
    rounds,
    merged,
    mergedCount: blocks.length,
    mergedBits: stateBitsOf(blocks.length),
    changed: blocks.length !== originalCount,
    verified: comparison.ok,
    sequences: comparison.sequences,
    depth,
  };
}

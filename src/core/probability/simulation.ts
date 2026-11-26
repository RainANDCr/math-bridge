import type { BooleanFunction } from "../boolean/model";

/**
 * 蒙特卡洛模拟
 *
 * 每一次试验都真的抽取 n 个 [0,1) 均匀随机数，逐变量与 P(X=1) 比较，
 * 再查真值表得到输出。没有任何「直接生成接近理论值的数据」的捷径。
 *
 * 使用可复现的 mulberry32 伪随机数发生器：给定种子，结果完全可重现。
 */

export interface SimulationCheckpoint {
  trials: number;
  frequency: number;
  ones: number;
}

export interface SimulationResult {
  trials: number;
  ones: number;
  zeros: number;
  frequency: number;
  seed: number;
  checkpoints: SimulationCheckpoint[];
}

/** 32 位可播种伪随机数发生器 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MonteCarloRun {
  readonly total: number;
  readonly seed: number;
  readonly checkpoints: SimulationCheckpoint[] = [];
  private readonly probs: number[];
  private readonly ones: boolean[];
  private readonly rng: () => number;
  private readonly n: number;
  private readonly milestones: number[];
  private nextMilestone = 0;
  private done = 0;
  private onesCount = 0;

  constructor(fn: BooleanFunction, probabilities: number[], total: number, seed: number) {
    this.total = total;
    this.seed = seed;
    this.n = fn.variables.length;
    this.probs = fn.variables.map((_, i) => Math.min(1, Math.max(0, probabilities[i] ?? 0.5)));
    this.ones = fn.values.map((v) => v === 1);
    this.rng = mulberry32(seed);
    this.milestones = buildMilestones(total);
  }

  get trials(): number {
    return this.done;
  }

  get finished(): boolean {
    return this.done >= this.total;
  }

  get onesSoFar(): number {
    return this.onesCount;
  }

  get frequency(): number {
    return this.done === 0 ? 0 : this.onesCount / this.done;
  }

  /** 执行指定次数的试验（分批调用以避免阻塞界面） */
  step(count: number): void {
    const n = this.n;
    const probs = this.probs;
    const ones = this.ones;
    const rng = this.rng;
    const limit = Math.min(this.done + count, this.total);
    let localOnes = this.onesCount;

    for (let t = this.done; t < limit; t += 1) {
      let index = 0;
      for (let j = 0; j < n; j += 1) {
        const p = probs[j];
        const bit = p >= 1 ? 1 : p <= 0 ? 0 : rng() < p ? 1 : 0;
        index = (index << 1) | bit;
      }
      if (ones[index]) localOnes += 1;

      // 里程碑采样，用于画收敛曲线（对数间隔，前期变化更清楚）
      if (
        this.nextMilestone < this.milestones.length &&
        t + 1 >= this.milestones[this.nextMilestone]
      ) {
        const trials = t + 1;
        this.checkpoints.push({
          trials,
          ones: localOnes,
          frequency: trials === 0 ? 0 : localOnes / trials,
        });
        this.nextMilestone += 1;
      }
    }

    this.onesCount = localOnes;
    this.done = limit;
  }

  runToEnd(): SimulationResult {
    this.step(this.total - this.done);
    return this.result();
  }

  result(): SimulationResult {
    return {
      trials: this.done,
      ones: this.onesCount,
      zeros: this.done - this.onesCount,
      frequency: this.done === 0 ? 0 : this.onesCount / this.done,
      seed: this.seed,
      checkpoints: [...this.checkpoints],
    };
  }
}

function buildMilestones(total: number): number[] {
  const out: number[] = [];
  let m = 1;
  while (m < total) {
    out.push(m);
    m = Math.max(m + 1, Math.ceil(m * 1.12));
  }
  out.push(total);
  return out;
}

/** 一次性跑完（测试与导出使用；界面请用 MonteCarloRun 分批执行） */
export function runSimulation(
  fn: BooleanFunction,
  probabilities: number[],
  total: number,
  seed: number
): SimulationResult {
  return new MonteCarloRun(fn, probabilities, total, seed).runToEnd();
}

/** 二项分布标准差，用于给模拟误差一个理论参照 */
export function simulationStdError(p: number, trials: number): number {
  if (trials <= 0) return 0;
  return Math.sqrt(Math.max(0, p * (1 - p)) / trials);
}

/** 生成一个随机种子 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

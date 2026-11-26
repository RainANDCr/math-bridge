import { describe, expect, it } from "vitest";
import { functionFromExpression, functionFromMinterms } from "../core/boolean/model";
import {
  outputDistribution,
  theoreticalProbability,
  normalizeProbabilities,
} from "../core/probability/theoretical";
import {
  MonteCarloRun,
  mulberry32,
  runSimulation,
  simulationStdError,
} from "../core/probability/simulation";

const heroFn = () => functionFromExpression("(A & B) | C");

describe("理论概率", () => {
  it("均匀输入下等于 1 格占比", () => {
    const fn = heroFn();
    const result = theoreticalProbability(fn, [0.5, 0.5, 0.5]);
    expect(result.p1).toBeCloseTo(0.625, 10);
    expect(result.p0).toBeCloseTo(0.375, 10);
  });

  it("手算样例：P(A)=P(B)=0.5, P(C)=0 → 0.25", () => {
    const fn = heroFn();
    const result = theoreticalProbability(fn, [0.5, 0.5, 0]);
    expect(result.p1).toBeCloseTo(0.25, 10);
  });

  it("退化输入把概率锁定为 0 或 1", () => {
    const fn = heroFn();
    expect(theoreticalProbability(fn, [1, 1, 0]).p1).toBeCloseTo(1, 10);
    expect(theoreticalProbability(fn, [1, 0, 0]).p1).toBeCloseTo(0, 10);
  });

  it("概率归一：所有行的权重之和为 1", () => {
    const fn = heroFn();
    const result = theoreticalProbability(fn, [0.3, 0.7, 0.9]);
    const total = result.rows.reduce((acc, r) => acc + r.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("无关项给出概率区间", () => {
    const fn = functionFromMinterms(["A", "B"], [0], [1]);
    const result = theoreticalProbability(fn, [0.5, 0.5]);
    expect(result.hasDontCares).toBe(true);
    expect(result.lowerBound).toBeCloseTo(0.25, 10);
    expect(result.upperBound).toBeCloseTo(0.5, 10);
  });

  it("输出分布三项之和为 1", () => {
    const fn = functionFromMinterms(["A", "B"], [0], [1]);
    const result = theoreticalProbability(fn, [0.4, 0.6]);
    const dist = outputDistribution(result);
    const sum = dist.reduce((acc, d) => acc + d.value, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("概率被限制在 0~1", () => {
    const fn = heroFn();
    expect(normalizeProbabilities(fn, [-1, 2, 0.5])).toEqual([0, 1, 0.5]);
  });
});

describe("蒙特卡洛模拟", () => {
  it("大样本频率接近理论值", () => {
    const fn = heroFn();
    const p = theoreticalProbability(fn, [0.5, 0.5, 0.5]).p1;
    const result = runSimulation(fn, [0.5, 0.5, 0.5], 100_000, 20260101);
    expect(Math.abs(result.frequency - p)).toBeLessThan(0.01);
    expect(result.ones + result.zeros).toBe(100_000);
  });

  it("同一种子完全可复现", () => {
    const fn = heroFn();
    const a = runSimulation(fn, [0.5, 0.5, 0.5], 5000, 42);
    const b = runSimulation(fn, [0.5, 0.5, 0.5], 5000, 42);
    expect(a.ones).toBe(b.ones);
    expect(a.checkpoints).toEqual(b.checkpoints);
  });

  it("不同种子给出不同结果", () => {
    const fn = heroFn();
    const a = runSimulation(fn, [0.5, 0.5, 0.5], 5000, 1);
    const b = runSimulation(fn, [0.5, 0.5, 0.5], 5000, 2);
    expect(a.ones).not.toBe(b.ones);
  });

  it("分批执行与一次跑完结果一致（界面分帧渲染依赖此性质）", () => {
    const fn = heroFn();
    const whole = runSimulation(fn, [0.5, 0.5, 0.5], 20000, 7);
    const chunked = new MonteCarloRun(fn, [0.5, 0.5, 0.5], 20000, 7);
    chunked.step(777);
    chunked.step(3000);
    chunked.step(20000);
    expect(chunked.onesSoFar).toBe(whole.ones);
    expect(chunked.finished).toBe(true);
  });

  it("收敛曲线的最后一个点等于最终频率", () => {
    const fn = heroFn();
    const result = runSimulation(fn, [0.5, 0.5, 0.5], 10000, 99);
    const last = result.checkpoints[result.checkpoints.length - 1];
    expect(last.trials).toBe(10000);
    expect(last.frequency).toBeCloseTo(result.frequency, 12);
  });

  it("确定性函数：恒 1 的函数频率为 1", () => {
    const fn = functionFromExpression("1");
    const result = runSimulation(fn, [], 1000, 3);
    expect(result.frequency).toBe(1);
  });

  it("伪随机数发生器均匀性检查", () => {
    const rng = mulberry32(123);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) sum += rng();
    expect(sum / n).toBeCloseTo(0.5, 1);
  });

  it("标准误差随试验次数按 1/√n 下降", () => {
    const a = simulationStdError(0.5, 100);
    const b = simulationStdError(0.5, 10000);
    expect(a / b).toBeCloseTo(10, 6);
  });
});

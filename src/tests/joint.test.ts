import { describe, expect, it } from "vitest";
import { functionFromExpression } from "../core/boolean/model";
import {
  analyzeJoint,
  independentWeights,
  jointMarginals,
  normalizeJoint,
  runJointSimulation,
  sampleJointRow,
} from "../core/probability/joint";
import { mulberry32 } from "../core/probability/simulation";

describe("联合分布归一化与边缘", () => {
  it("权重归一化成概率", () => {
    expect(normalizeJoint([1, 1, 0, 2])).toEqual([0.25, 0.25, 0, 0.5]);
  });

  it("全零权重退化为均匀分布，而不是 NaN", () => {
    const weights = normalizeJoint([0, 0, 0, 0]);
    expect(weights).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(weights.every((weight) => Number.isFinite(weight))).toBe(true);
  });

  it("边缘概率由联合分布求和得到", () => {
    // 只落在 00 与 11 上：A 与 B 的边缘都是 0.5
    expect(jointMarginals([0.5, 0, 0, 0.5], 2)).toEqual([0.5, 0.5]);
    // 只落在 01（A=0）与 11（A=1）上：B 恒为 1，A 有 0.7 的概率为 1
    const marginals = jointMarginals([0, 0.3, 0, 0.7], 2);
    expect(marginals[0]).toBeCloseTo(0.7);
    expect(marginals[1]).toBeCloseTo(1);
  });

  it("独立联合分布就是边缘概率之积", () => {
    const weights = independentWeights(2, [0.3, 0.6]);
    expect(weights[0]).toBeCloseTo(0.7 * 0.4);
    expect(weights[1]).toBeCloseTo(0.7 * 0.6);
    expect(weights[2]).toBeCloseTo(0.3 * 0.4);
    expect(weights[3]).toBeCloseTo(0.3 * 0.6);
  });
});

describe("相关性如何改变输出概率", () => {
  const xor = functionFromExpression("A ^ B");

  it("完全相关的 A、B：异或恒为 0，而独立模型给出 0.5", () => {
    const joint = analyzeJoint(xor, [0.5, 0, 0, 0.5]);
    expect(joint.marginals[0]).toBeCloseTo(0.5);
    expect(joint.marginals[1]).toBeCloseTo(0.5);
    expect(joint.p1).toBeCloseTo(0);
    // 同样的边缘概率、假设独立 → 0.5
    expect(joint.independentP1).toBeCloseTo(0.5);
    expect(joint.delta).toBeCloseTo(-0.5);
  });

  it("按独立分布填充时两者一致，且没有相关性标记", () => {
    const weights = independentWeights(2, [0.5, 0.5]);
    const joint = analyzeJoint(xor, weights);
    expect(joint.p1).toBeCloseTo(0.5);
    expect(joint.independentP1).toBeCloseTo(0.5);
    expect(joint.delta).toBeCloseTo(0);
    expect(joint.pairs.every((pair) => !pair.dependent)).toBe(true);
  });

  it("完全相关时 A、B 那一对会被标为相关", () => {
    const joint = analyzeJoint(xor, [0.5, 0, 0, 0.5]);
    const pair = joint.pairs[0];
    expect(pair.dependent).toBe(true);
    expect(pair.pBoth).toBeCloseTo(0.5);
    expect(pair.pProduct).toBeCloseTo(0.25);
    expect(pair.delta).toBeCloseTo(0.25);
  });
});

describe("按联合分布抽样", () => {
  it("抽样只会落在有权重的行上", () => {
    const weights = [1, 0, 0, 0];
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i += 1) expect(sampleJointRow(weights, rng)).toBe(0);
  });

  it("模拟频率收敛到联合模型的 P(F=1)，而不是独立模型的值", () => {
    const xor = functionFromExpression("A ^ B");
    const weights = [0.5, 0, 0, 0.5];
    const result = runJointSimulation(xor, weights, 5000, 12345);
    // 只抽到 00 与 11，异或恒为 0 —— 频率必须精确为 0
    expect(result.frequency).toBe(0);
    expect(result.ones).toBe(0);
    expect(result.checkpoints.length).toBeGreaterThan(0);
  });

  it("同样的种子结果可复现", () => {
    const fn = functionFromExpression("(A & B) | C");
    const weights = [0.1, 0.2, 0.05, 0.15, 0.2, 0.1, 0.1, 0.1];
    const a = runJointSimulation(fn, weights, 2000, 99);
    const b = runJointSimulation(fn, weights, 2000, 99);
    expect(a.ones).toBe(b.ones);
  });
});

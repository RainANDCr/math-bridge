import { describe, expect, it } from "vitest";
import { parseExperimentJson, validateExperiment } from "../store/persistence";

const valid = {
  kind: "mathbridge.experiment",
  version: 1,
  savedAt: 1795614000000,
  studio: "karnaugh",
  theme: "dark",
  expression: "F = (A & B) | C",
  variables: ["A", "B", "C"],
  values: [0, 1, 0, 1, 0, 1, 1, 1],
  probabilities: [0.5, 0.5, 0.5],
  manualGroups: [{ id: "g1", cells: [1, 3] }],
  trials: 1000,
  seed: 20260101,
  recentExpressions: ["F = (A & B) | C"],
};

describe("实验文件校验", () => {
  it("接受合法文件", () => {
    const result = validateExperiment(valid);
    expect(result.ok).toBe(true);
    expect(result.data?.variables).toEqual(["A", "B", "C"]);
    expect(result.data?.values).toHaveLength(8);
  });

  it("拒绝非本项目的文件", () => {
    const result = validateExperiment({ ...valid, kind: "something-else" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("MATH BRIDGE");
  });

  it("拒绝输出向量长度不符的文件", () => {
    const result = validateExperiment({ ...valid, values: [0, 1, 0] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("values");
  });

  it("拒绝非法的输出值", () => {
    const result = validateExperiment({ ...valid, values: [0, 1, 2, 1, 0, 1, 1, 1] });
    expect(result.ok).toBe(false);
  });

  it("拒绝越界的分组编号", () => {
    const result = validateExperiment({
      ...valid,
      manualGroups: [{ id: "g1", cells: [99] }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("格子编号");
  });

  it("拒绝越界的概率", () => {
    const result = validateExperiment({ ...valid, probabilities: [0.5, 1.4, 0.5] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("probabilities");
  });

  it("拒绝重复变量", () => {
    const result = validateExperiment({ ...valid, variables: ["A", "A"] });
    expect(result.ok).toBe(false);
  });

  it("JSON 解析失败时给出可读错误", () => {
    const result = parseExperimentJson("{ not json");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("JSON");
  });

  it("未知 studio 回退到 overview 而不是报错", () => {
    const result = validateExperiment({ ...valid, studio: "unknown" });
    expect(result.ok).toBe(true);
    expect(result.data?.studio).toBe("overview");
  });
});

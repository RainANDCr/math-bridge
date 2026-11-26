import { describe, expect, it } from "vitest";
import { CONCEPTS, RELATIONS, conceptById, relationsOf, type Domain } from "../core/knowledge/concepts";

/**
 * 概念库是手写数据，最容易出的错是「加了新条目但忘了配套字段」：
 * domain 写成不在枚举里的值、关系指向已被删掉的概念、公式或误区留空。
 * TypeScript 只能挡住字面量类型，挡不住数据层面的空洞，所以这里逐条查。
 */

const DOMAINS: Array<Domain | "公共"> = ["离散数学", "概率论", "数字电路", "公共"];

describe("概念库", () => {
  it("id 唯一", () => {
    const ids = CONCEPTS.map((concept) => concept.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个概念的必填字段都非空", () => {
    for (const concept of CONCEPTS) {
      expect(concept.zh.length, concept.id).toBeGreaterThan(0);
      expect(concept.en.length, concept.id).toBeGreaterThan(0);
      expect(concept.definition.trim().length, concept.id).toBeGreaterThan(4);
      expect(concept.formula.length, concept.id).toBeGreaterThan(0);
      expect(concept.intuition.length, concept.id).toBeGreaterThan(5);
      expect(concept.experiment.length, concept.id).toBeGreaterThan(5);
      expect(concept.misconceptions.length, concept.id).toBeGreaterThan(0);
      expect(concept.misconceptions.every((item) => item.trim().length > 0), concept.id).toBe(true);
    }
  });

  it("domain 与 cross 里的学科都在允许范围内", () => {
    for (const concept of CONCEPTS) {
      expect(DOMAINS, concept.id).toContain(concept.domain);
      for (const item of concept.cross) {
        expect(DOMAINS, `${concept.id} → ${item.text}`).toContain(item.domain);
        expect(item.text.trim().length, concept.id).toBeGreaterThan(0);
      }
    }
  });

  it("关系两端的 id 都真的存在", () => {
    const ids = new Set(CONCEPTS.map((concept) => concept.id));
    for (const relation of RELATIONS) {
      expect(ids.has(relation.from), relation.label).toBe(true);
      expect(ids.has(relation.to), relation.label).toBe(true);
      expect(relation.from).not.toBe(relation.to);
      expect(relation.strength === "exact" || relation.strength === "analogy").toBe(true);
    }
  });

  it("每个概念都能被 conceptById 找到，且至少连着一条关系", () => {
    for (const concept of CONCEPTS) {
      expect(conceptById(concept.id)?.zh).toBe(concept.zh);
      // 孤立节点在「相关概念」里会是一片空白，说明还没把它接进图谱
      expect(relationsOf(concept.id).length, concept.zh).toBeGreaterThan(0);
    }
  });

  it("三个学科都有内容，跨课程对应不只是单向引用", () => {
    for (const domain of ["离散数学", "概率论", "数字电路"] as const) {
      expect(CONCEPTS.filter((concept) => concept.domain === domain).length).toBeGreaterThan(0);
    }
    const exact = RELATIONS.filter((relation) => relation.strength === "exact");
    expect(exact.length).toBeGreaterThan(RELATIONS.length / 2);
  });
});

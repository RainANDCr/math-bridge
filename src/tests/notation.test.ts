import { describe, expect, it } from "vitest";
import { parse } from "../core/boolean/parser";
import { functionFromExpression } from "../core/boolean/model";
import { GATES, GATE_KINDS, gateOutput, gateTruth } from "../core/logic-gates/gates";
import { renderNotation, termToNotation, canonicalSopAst } from "../core/notation/notationConversion";
import { verifyAllModes, verifyMode, verifyText } from "../core/notation/notationValidation";
import { hasBar } from "../core/notation/notationTypes";
import { DISCIPLINES, type Discipline } from "../core/notation/notationTypes";
import { OPERATORS, searchOperators, variantFor, operatorById } from "../core/notation/notationRegistry";

/** 把表达式压成 "0101" 形式的真值向量，便于直接比较两种写法是否同一个函数 */
function vector(expr: string): string {
  const fn = functionFromExpression(expr);
  return fn.values.map((v) => String(v)).join("");
}

const ALL_DISCIPLINES: Discipline[] = ["discrete", "digital", "boolean", "set", "probability"];

describe("符号别名解析", () => {
  it("后缀取反只作用于紧邻对象", () => {
    expect(vector("A' & B")).toBe(vector("!A & B"));
    expect(vector("A·B'")).toBe(vector("A & !B"));
    expect(vector("(A & B)'")).toBe(vector("!(A & B)"));
    expect(vector("A·B'")).not.toBe(vector("(A·B)'"));
  });

  it("词形运算符先运算后取反", () => {
    expect(vector("A NAND B")).toBe(vector("!(A & B)"));
    expect(vector("A NOR B")).toBe(vector("!(A | B)"));
    expect(vector("A XNOR B")).toBe(vector("!(A ^ B)"));
    expect(vector("A XOR B")).toBe(vector("A ^ B"));
    expect(vector("A AND B OR NOT C")).toBe(vector("(A & B) | !C"));
  });

  it("集合与事件符号按同一结构解析", () => {
    expect(vector("A ∩ B ∪ Cᶜ")).toBe(vector("(A & B) | !C"));
    expect(vector("(A∩B)ᶜ")).toBe(vector("!(A & B)"));
    expect(vector("A △ B")).toBe(vector("A ^ B"));
  });

  it("同或的两种写法", () => {
    expect(vector("A ⊙ B")).toBe(vector("!(A ^ B)"));
    expect(vector("A ↔ B")).toBe(vector("!(A ^ B)"));
  });

  it("上划线写作组合字符时作用于前一个变量", () => {
    expect(vector("A\u0305·B")).toBe(vector("!A & B"));
    expect(vector("(A+B)\u0305")).toBe(vector("!(A | B)"));
  });

  it("省略乘号：AB 与 A(B+C)", () => {
    expect(vector("AB + C'")).toBe(vector("(A & B) | !C"));
    expect(vector("A(B+C)")).toBe(vector("A & (B | C)"));
    // 隐式与只在 AND 层生效，不能把 A+B·C 读成 (A+B)·C
    expect(vector("A + BC")).toBe(vector("A | (B & C)"));
  });

  it("大小写不敏感的词形运算符", () => {
    expect(vector("a and b")).toBe(vector("A & B"));
    expect(vector("a nand b")).toBe(vector("!(A & B)"));
  });

  it("无法识别的字符仍然报出位置", () => {
    try {
      parse("A & B # C");
      expect.unreachable("应当抛出错误");
    } catch (error) {
      expect((error as { position: number }).position).toBe(6);
    }
  });
});

describe("逻辑门真值表（与界面实现独立的期望值）", () => {
  const expected: Record<string, string> = {
    AND: "0001",
    OR: "0111",
    NAND: "1110",
    NOR: "1000",
    XOR: "0110",
    XNOR: "1001",
    NOT: "10",
    BUFFER: "01",
  };

  for (const kind of GATE_KINDS) {
    it(`${kind} 的真值表`, () => {
      expect(gateTruth(kind).map((row) => row.f).join("")).toBe(expected[kind]);
    });
  }

  it("gateOutput 与真值表逐行一致", () => {
    for (const kind of GATE_KINDS) {
      for (const row of gateTruth(kind)) {
        expect(gateOutput(kind, row.a, row.b ?? 0)).toBe(row.f);
      }
    }
  });

  it("门的 AST 与统一求值器给出同一个函数", () => {
    // 用一个独立的字符串写法反查，避免「自己验证自己」
    const canonical: Record<string, string> = {
      AND: "A & B",
      OR: "A | B",
      NAND: "!(A & B)",
      NOR: "!(A | B)",
      XOR: "A ^ B",
      XNOR: "!(A ^ B)",
      NOT: "!A",
      BUFFER: "A",
    };
    for (const kind of GATE_KINDS) {
      expect(vector(canonical[kind])).toBe(gateTruth(kind).map((row) => row.f).join(""));
      expect(GATES[kind].ast).toBeTruthy();
    }
  });
});

describe("跨学科渲染：F = (A AND B) OR NOT C", () => {
  const ast = parse("(A & B) | !C");

  it("离散数学记法", () => {
    expect(renderNotation(ast, "discrete", "textbook").text).toBe("A ∧ B ∨ ¬C");
    expect(renderNotation(ast, "discrete", "compact").text).toBe("A&B|~C");
  });

  it("数字电路记法（上划线用结构化节点，不是字符串）", () => {
    const rendered = renderNotation(ast, "digital", "textbook");
    expect(hasBar(rendered.nodes)).toBe(true);
    expect(rendered.text).toBe("A·B + C\u0305");
    expect(renderNotation(ast, "digital", "compact").text).toBe("AB+C′");
  });

  it("布尔代数记法", () => {
    expect(renderNotation(ast, "boolean", "textbook").text).toBe("AB + C′");
    expect(renderNotation(ast, "boolean", "compact").text).toBe("AB+C′");
  });

  it("集合论记法", () => {
    expect(renderNotation(ast, "set", "textbook").text).toBe("A ∩ B ∪ Cᶜ");
    expect(renderNotation(ast, "set", "compact").text).toBe("A∩B∪Cᶜ");
  });

  it("概率论记法：只写事件表达，不擅自代入数值", () => {
    const rendered = renderNotation(ast, "probability", "textbook");
    expect(rendered.text).toBe("P(A ∩ B ∪ Cᶜ)");
    expect(rendered.conditions?.length).toBeGreaterThan(0);
    expect(rendered.conditions?.join(" ")).toContain("独立");
  });

  it("同或按学科选择字形", () => {
    const xnor = parse("A ⊙ B");
    expect(renderNotation(xnor, "discrete", "textbook").text).toBe("A ↔ B");
    expect(renderNotation(xnor, "digital", "textbook").text).toBe("A ⊙ B");
    expect(renderNotation(xnor, "boolean", "textbook").text).toBe("A ⊙ B");
    expect(renderNotation(xnor, "set", "textbook").text).toBe("(A △ B)ᶜ");
    expect(renderNotation(xnor, "probability", "textbook").text).toBe("P((A △ B)ᶜ)");
  });

  it("与非 / 或非在数字电路中是整项取反", () => {
    expect(renderNotation(parse("!(A&B)"), "digital", "textbook").text).toBe("(A·B)′");
    expect(renderNotation(parse("!(A|B)"), "set", "textbook").text).toBe("(A ∪ B)ᶜ");
    // 文本回退用撇号，但记号树里必须是整段上划线
    expect(hasBar(renderNotation(parse("!(A&B)"), "digital", "textbook").nodes)).toBe(true);
  });
});

describe("符号切换不改变函数", () => {
  const expressions = [
    "A",
    "0",
    "1",
    "!A",
    "A & !B",
    "!(A | B)",
    "(A | B) & C",
    "A ^ B",
    "!(A ^ B)",
    "A & (B | C)",
    "(A & B) | (C & !D)",
    "A ⊙ B",
    "A ⊕ B ⊕ C",
    "!(A & 1)",
    "A NAND B",
    "A NOR B",
  ];

  for (const style of ["textbook", "compact"] as const) {
    it(`五种记法 × ${style} 全部可回读且等价`, () => {
      for (const expr of expressions) {
        const ast = parse(expr);
        for (const check of verifyAllModes(ast, style)) {
          expect(check.ok, `${expr} 在 ${check.mode}/${style} 失败：${check.mismatches.join("；")}`).toBe(
            true
          );
        }
      }
    });
  }

  it("回读后的真值向量与原始表达式一致", () => {
    for (const expr of expressions) {
      const fn = functionFromExpression(expr);
      for (const mode of ALL_DISCIPLINES) {
        const rendered = renderNotation(fn.ast!, mode, "textbook");
        const back = functionFromExpression(rendered.ascii);
        expect(back.values.join(""), `${expr} → ${mode}`).toBe(fn.values.join(""));
      }
    }
  });

  it("验证器能抓出「少一层括号」", () => {
    // (A+B)·C 与 A+B·C 的文本长得很像，但真值表不同；验证器必须报错而不是放行
    const ast = parse("(A|B)&C");
    expect(verifyText(ast, "A + B·C", "digital").ok).toBe(false);
    expect(verifyText(ast, "A + B·C", "digital").mismatches.length).toBeGreaterThan(0);
    expect(verifyText(ast, "(A + B)·C", "digital").ok).toBe(true);
    expect(verifyMode(ast, "digital", "textbook").ok).toBe(true);
  });
});

describe("符号注册表", () => {
  it("八种运算都有完整说明", () => {
    expect(OPERATORS).toHaveLength(8);
    for (const entry of OPERATORS) {
      expect(entry.zh.length).toBeGreaterThan(0);
      expect(entry.en.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(0);
      expect(entry.confusions.length).toBeGreaterThan(0);
      expect(entry.example.explain.length).toBeGreaterThan(0);
      expect(entry.symbols.length + entry.variants.digital!.forms.length).toBeGreaterThan(0);
    }
  });

  it("每个学科条目都写明语境，不适用时明确为 null", () => {
    for (const entry of OPERATORS) {
      for (const d of DISCIPLINES) {
        const variant = entry.variants[d.id];
        if (variant) {
          expect(variant.note.length).toBeGreaterThan(4);
          expect(variant.primary.length).toBeGreaterThan(0);
        }
      }
    }
    const buffer = operatorById("buffer");
    expect(variantFor(buffer, "set")).toBeNull();
    expect(variantFor(buffer, "probability")).toBeNull();
    expect(variantFor(buffer, "digital")).not.toBeNull();
  });

  it("同或、与非、或非都指向正确的门", () => {
    expect(operatorById("xnor").gate).toBe("XNOR");
    expect(operatorById("nand").gate).toBe("NAND");
    expect(operatorById("nor").gate).toBe("NOR");
  });

  it("搜索能命中中英文、符号与同义词", () => {
    const ids = (query: string, d: Discipline | "all" = "all") =>
      searchOperators(query, d).map((entry) => entry.id);
    expect(ids("AND")).toContain("and");
    expect(ids("与")).toContain("and");
    expect(ids("∧")).toContain("and");
    expect(ids("·")).toContain("and");
    expect(ids("交集")).toContain("and");
    expect(ids("对称差")).toContain("xor");
    expect(ids("上划线")).toContain("not");
    expect(ids("nand")).toContain("nand");
    expect(ids("")).toHaveLength(8);
  });

  it("按学科筛选时排除无对应的运算", () => {
    const setIds = searchOperators("", "set").map((entry) => entry.id);
    expect(setIds).not.toContain("buffer");
    expect(setIds).toContain("and");
  });
});

describe("符号与既有模块的衔接", () => {
  it("K 图分组标签按记法渲染", () => {
    const literals = [
      { variable: "A", negated: false },
      { variable: "B", negated: true },
    ];
    expect(termToNotation(literals, "digital", "textbook")).toBe("A·B\u0305");
    expect(termToNotation(literals, "boolean", "textbook")).toBe("AB′");
    expect(termToNotation(literals, "set", "textbook")).toBe("A ∩ Bᶜ");
    expect(termToNotation(literals, "discrete", "textbook")).toBe("A ∧ ¬B");
  });

  it("规范与或式的 AST 与原函数逐行一致", () => {
    const fn = functionFromExpression("(A & B) | C");
    const ast = canonicalSopAst(fn);
    expect(ast).not.toBeNull();
    for (let i = 0; i < fn.values.length; i += 1) {
      const expected = fn.values[i] === 1;
      // 用序列化后的表达式再求值，避免直接读同一个 AST
      const rendered = renderNotation(ast!, "discrete", "textbook").ascii;
      const back = functionFromExpression(rendered);
      expect(back.values[i] === 1, `m${i}`).toBe(expected);
    }
  });

  it("常量与单变量的边界情况", () => {
    expect(renderNotation(parse("1"), "digital", "textbook").text).toBe("1");
    expect(renderNotation(parse("A"), "set", "textbook").text).toBe("A");
    expect(renderNotation(parse("!A"), "set", "textbook").text).toBe("Aᶜ");
    expect(renderNotation(parse("A & 1"), "boolean", "compact").text).toBe("A·1");
  });
});

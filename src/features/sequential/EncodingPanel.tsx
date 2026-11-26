import { useMemo } from "react";
import { Check } from "lucide-react";
import { Badge, Button, Panel, Segmented } from "../../components/common";
import {
  deriveSequential,
  describeEncoding,
  encodingOf,
  searchEncodings,
  stateCodesOf,
  stateBitsOf,
  type EncodingScheme,
  type StateMachine,
} from "../../core/sequential/machine";
import { oneHotGroups } from "../../core/sequential/comparison";

/**
 * 状态编码
 *
 * 二进制与 one-hot 走同一条推导路径，区别只在码字：
 *   · 二进制：ceil(log2 n) 个触发器，空出来的码是无关项，方程要靠卡诺图化简；
 *   · one-hot：n 个触发器，D_i 就是「进入 S_i 的所有转移」之和，可直接从状态图读出。
 *
 * 二进制编码下「把哪个状态编成哪个码」仍是可优化变量，所以把全部分配真算一遍。
 */
export function EncodingPanel({
  machine,
  onCodes,
  onEncoding,
}: {
  machine: StateMachine;
  onCodes: (codes: number[]) => void;
  onEncoding: (scheme: EncodingScheme) => void;
}) {
  const onehot = encodingOf(machine) === "onehot";
  const search = useMemo(
    () => (onehot ? null : searchEncodings(machine, 6)),
    [machine, onehot]
  );
  const current = stateCodesOf(machine);
  const bits = stateBitsOf(machine.stateCount);

  const oneHotDesign = useMemo(
    () => (onehot ? deriveSequential(machine) : null),
    [machine, onehot]
  );
  const oneHot = useMemo(() => (onehot ? oneHotGroups(machine) : []), [machine, onehot]);

  return (
    <Panel
      title="状态编码"
      sub="同一个状态可以编成任意码字，触发器数量与方程复杂度随之改变"
      actions={
        <Segmented
          value={encodingOf(machine)}
          onChange={(value) => onEncoding(value as EncodingScheme)}
          label="编码方案"
          options={[
            { value: "binary", label: "二进制" },
            { value: "onehot", label: "one-hot" },
          ]}
        />
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="encoding-current">
          <span className="field__label">当前编码</span>
          <code className="encoding-current__codes">{describeEncoding(machine, current)}</code>
          <span className="tiny dim">
            {onehot
              ? `${machine.stateCount} 个状态各占一位，共 ${machine.stateCount} 个触发器`
              : search
              ? `码字空间 ${search.capacity} 个（${bits} 位），共 ${search.total} 种分配，已全部推导比较`
              : ""}
          </span>
        </div>

        {onehot ? (
          <>
            <div className="onehot-groups">
              {oneHot.map((group) => {
                const variable = `D${machine.stateCount - 1 - group.state}`;
                const equation = oneHotDesign?.equations.find((item) => item.variable === variable);
                const minimized = equation?.result.expression ?? "0";
                const simpler = equation && minimized !== group.expression;
                return (
                  <div className="onehot-row" key={group.state}>
                    <span className="onehot-row__q">
                      <strong>{variable}</strong>
                      <span className="tiny dim">← S{group.state}</span>
                    </span>
                    <code className="onehot-row__direct">
                      {group.expression}
                    </code>
                    <span className="onehot-row__count tiny dim">
                      {group.terms.length} 条转移
                    </span>
                    {simpler && (
                      <span className="onehot-row__min">
                        <span className="tiny dim">化简后</span>
                        <code>{minimized}</code>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="tiny dim" style={{ lineHeight: 1.7 }}>
              每个 D 直接写成「哪些状态的哪些输入会进入我」之和，<strong>不需要卡诺图</strong>：
              式子里的 Q 是源状态那一位。代价是触发器从 {bits} 个变成 {machine.stateCount} 个；
              FPGA 里触发器便宜、门贵，所以 one-hot 常常更快。多个 Q 同时为 1 的组合永远不会出现，
              化简时按无关项处理。
            </div>
          </>
        ) : (
          <>
            <div className="encoding-list">
              {search?.candidates.map((candidate, index) => {
                const isBest = index === 0;
                return (
                  <div
                    key={candidate.label}
                    className={`encoding-row${candidate.isCurrent ? " is-current" : ""}${
                      isBest ? " is-best" : ""
                    }`}
                  >
                    <span className="encoding-row__rank">{index + 1}</span>
                    <code className="encoding-row__codes">{candidate.label}</code>
                    <span className="encoding-row__cost">
                      <strong>{candidate.literals}</strong>
                      <span className="tiny dim">文字</span>
                    </span>
                    <span className="encoding-row__cost">
                      <strong>{candidate.terms}</strong>
                      <span className="tiny dim">项</span>
                    </span>
                    <span className="encoding-row__action">
                      {candidate.isCurrent ? (
                        <Badge tone="mute">
                          <Check size={10} /> 使用中
                        </Badge>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => onCodes(candidate.codes)}>
                          应用
                        </Button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="tiny dim" style={{ lineHeight: 1.7 }}>
              编码只改变状态的二进制表示，<strong>不改转移关系</strong>：S0 还是 S0，
              只是它在卡诺图上占的格子换了位置。相邻编码的两个状态在图上挨着，
              分组就能跨过它们，方程因此可能少几个文字。
              {machine.stateCount === 3 &&
                "（3 个状态占 4 个码字，空出来的那一个码是无关项，可以帮着把圈画大。）"}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

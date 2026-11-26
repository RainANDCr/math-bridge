import { Moon, Sun } from "lucide-react";
import { useApp } from "../../store/appStore";
import { routeOf } from "../../app/routes";
import { Button } from "../common";

export function TopBar() {
  const { state, actions } = useApp();
  const route = routeOf(state.studio);
  // 顶栏始终显示用户最后确认过的写法（表达式或 Σm 记号），而不是派生出来的最小项列表
  const label = (state.expressionInput || state.fn.expression).replace(/^F\s*=\s*/, "");

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__title">
          <h1>{route.zh}</h1>
          <p>
            {route.en} · {route.desc}
          </p>
        </div>
      </div>

      <div className="topbar__right">
        <span
          className="topbar__fn"
          title={`当前函数：${state.expressionInput}（${state.fn.variables.join(", ") || "常量"}）`}
        >
          <span style={{ color: "var(--text-mute)" }}>F =</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={actions.toggleTheme}
          aria-label={state.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          title={state.theme === "dark" ? "浅色主题" : "深色主题"}
          icon={state.theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        />
      </div>
    </header>
  );
}

import { useEffect } from "react";
import { AppProvider, useApp } from "./store/appStore";
import { NavRail } from "./components/layout/NavRail";
import { TopBar } from "./components/layout/TopBar";
import { ToastHost } from "./components/layout/ToastHost";
import { ROUTES, STUDIO_HASH, studioFromHash } from "./app/routes";
import { Overview } from "./features/overview/Overview";
import { LogicStudio } from "./features/logic-studio/LogicStudio";
import { NotationEncyclopedia } from "./features/notation-encyclopedia/NotationEncyclopedia";
import { KarnaughStudio } from "./features/karnaugh-studio/KarnaughStudio";
import { MultiOutputStudio } from "./features/multi-output/MultiOutputStudio";
import { SequentialStudio } from "./features/sequential/SequentialStudio";
import { GateLab } from "./features/gate-lab/GateLab";
import { ProbabilityStudio } from "./features/probability-studio/ProbabilityStudio";
import { ConnectionLab } from "./features/connection-lab/ConnectionLab";
import { Reference } from "./features/reference/Reference";

function StudioSwitch() {
  const { state } = useApp();
  switch (state.studio) {
    case "overview":
      return <Overview />;
    case "logic":
      return <LogicStudio />;
    case "notation":
      return <NotationEncyclopedia />;
    case "karnaugh":
      return <KarnaughStudio />;
    case "multi":
      return <MultiOutputStudio />;
    case "sequential":
      return <SequentialStudio />;
    case "gate":
      return <GateLab />;
    case "probability":
      return <ProbabilityStudio />;
    case "connection":
      return <ConnectionLab />;
    case "reference":
      return <Reference />;
    default:
      return <Overview />;
  }
}

function Shell() {
  const { state, actions } = useApp();

  // 用 hash 保存当前工作台，刷新后仍停在原处
  useEffect(() => {
    const sync = () => {
      const key = studioFromHash(window.location.hash);
      if (key) actions.setStudio(key);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [actions]);

  useEffect(() => {
    const target = STUDIO_HASH[state.studio];
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [state.studio]);

  // 键盘：Alt+1..9 / Alt+0 切换工作台，Esc 关闭提示
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        actions.dismissToast();
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      // Alt+0 对应第 10 个（最后一个）工作台
      const index = event.key === "0" ? 10 : Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= ROUTES.length) {
        event.preventDefault();
        actions.setStudio(ROUTES[index - 1].key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);

  return (
    <div className="app">
      <NavRail />
      <div className="app__main">
        <TopBar />
        <div className="studio">
          <StudioSwitch />
        </div>
        <ToastHost />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

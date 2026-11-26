import { useApp } from "../../store/appStore";
import { ROUTES } from "../../app/routes";

export function NavRail() {
  const { state, actions, lastSavedAt } = useApp();

  return (
    <nav className="rail" aria-label="主导航">
      <div className="rail__brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 11.5c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <circle cx="2" cy="11.6" r="1.5" fill="currentColor" />
            <circle cx="14" cy="11.6" r="1.5" fill="currentColor" />
            <circle cx="8" cy="6" r="1.5" fill="currentColor" />
          </svg>
        </span>
        <div className="brand-text">
          <strong>MATH BRIDGE</strong>
          <span>数学知识桥</span>
        </div>
      </div>

      <div className="rail__label">工作台</div>
      <div className="rail__nav">
        {ROUTES.map((route) => {
          const Icon = route.icon;
          const active = state.studio === route.key;
          return (
            <button
              key={route.key}
              type="button"
              className={`rail__item ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => actions.setStudio(route.key)}
              title={`${route.zh} · ${route.en}`}
            >
              <span className="rail__icon">
                <Icon size={15} strokeWidth={1.7} />
              </span>
              <span className="rail__text">
                <strong className="rail__zh">{route.zh}</strong>
                <strong className="rail__short">{route.short}</strong>
                <span>{route.en}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rail__foot">
        <div className="rail__status">
          <span className="dot" aria-hidden="true" />
          本地运行 · 无需网络
        </div>
        <div className="rail__status">
          <span className="mono tiny">
            {lastSavedAt
              ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString("zh-CN", {
                  hour12: false,
                })}`
              : "尚未写入本地"}
          </span>
        </div>
      </div>
    </nav>
  );
}

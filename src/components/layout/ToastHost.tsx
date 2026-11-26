import { useEffect } from "react";
import { useApp } from "../../store/appStore";
import { Toast } from "../common";

export function ToastHost() {
  const { state, actions } = useApp();
  const toast = state.toast;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => actions.dismissToast(), 4200);
    return () => window.clearTimeout(timer);
  }, [toast, actions]);

  if (!toast) return null;
  return <Toast kind={toast.kind} text={toast.text} onClose={actions.dismissToast} />;
}

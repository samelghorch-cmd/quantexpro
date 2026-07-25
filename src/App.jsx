import { useState, useEffect, Component, Suspense } from "react";
import { PipelineProvider, usePipeline } from "./state/PipelineContext.jsx";
import { Sidebar } from "./components/layout/Sidebar.jsx";
import { TickerBar } from "./components/layout/TickerBar.jsx";
import { T } from "./components/shared/theme.ts";
import { ALL_MODULES } from "./registry.ts";
import { PAGES } from "./pages/index.jsx";
import { GlobalControls } from "./components/layout/GlobalControls.jsx";
import { completeOidcCallbackFromUrl } from "./engine/ssoAuth.ts";

// Garde-fou : isole les erreurs d'UN module pour que le reste de la plateforme ne plante jamais.
class ModuleErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 30 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.red }}>⚠️ Ce module a rencontré une erreur</div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: T.textDim, lineHeight: 1.6 }}>Le reste de la plateforme fonctionne normalement — change de module, ou recharge la page. Détail technique :</div>
          <pre style={{ marginTop: 10, fontSize: 11, color: T.textFaint, background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, overflow: "auto", whiteSpace: "pre-wrap", maxHeight: 220 }}>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <PipelineProvider>
      <Shell />
    </PipelineProvider>
  );
}

function Shell() {
  const { activeModule, navigate } = usePipeline();
  const [collapsed, setCollapsed] = useState(false);
  const mod = ALL_MODULES.find((m) => m.id === activeModule);
  const Page = PAGES[activeModule];

  useEffect(() => {
    if (!window.location.search.includes("code=")) return;
    completeOidcCallbackFromUrl().catch((e) => {
      console.warn("[SSO] callback OIDC:", e.message || e);
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.bg0, color: T.text, fontFamily: T.sans }}>
      <TickerBar />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar active={activeModule} onSelect={navigate} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderBottom: `1px solid ${T.border}`, background: T.bg1, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{mod?.label || "—"}</div>
              <div style={{ fontSize: 10.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>{mod?.section}</div>
            </div>
            <GlobalControls />
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
            <ModuleErrorBoundary key={activeModule}>
              <Suspense fallback={<div style={{ color: T.textDim, fontSize: 12.5 }}>Chargement du module…</div>}>
                {Page ? <Page /> : <div style={{ color: T.textDim }}>Module introuvable.</div>}
              </Suspense>
            </ModuleErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { PipelineProvider, usePipeline } from "./state/PipelineContext.jsx";
import { Sidebar } from "./components/layout/Sidebar.jsx";
import { TickerBar } from "./components/layout/TickerBar.jsx";
import { T } from "./components/shared/theme.js";
import { ALL_MODULES } from "./registry.js";
import { PAGES } from "./pages/index.jsx";
import { GlobalControls } from "./components/layout/GlobalControls.jsx";

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
            {Page ? <Page /> : <div style={{ color: T.textDim }}>Module introuvable.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

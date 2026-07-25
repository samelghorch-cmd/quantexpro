// Labs — hub des modules expérimentaux / connecteurs externes (P2-UI).
import { usePipeline } from "../../state/PipelineContext.jsx";
import { Panel, Button, Badge } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

const LAB_ITEMS = [
  {
    id: "sentiment",
    title: "Sentiment (RSS)",
    blurb: "Fed · SEC · IMF — lexique LONG/SHORT + Jaccard. Pas de scraping social.",
    providers: "Fed/SEC/IMF + arXiv/NBER/BIS · rate-limité",
  },
  {
    id: "shipTracker",
    title: "Ship Tracker",
    blurb: "Trafic maritime AIS (flux matières premières).",
    providers: "MarineTraffic · Spire AIS",
  },
  {
    id: "liveTv",
    title: "Live TV",
    blurb: "Flux vidéo / actualité financière en direct.",
    providers: "Bloomberg TV · CNBC · YouTube Live",
  },
];

export function LabsHubPage() {
  const { navigate } = usePipeline();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Labs</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.55, maxWidth: 640 }}>
          Espace connecteurs externes. Aucune donnée inventée : chaque module reste en empty state
          jusqu’à configuration d’une clé / source locale. Les doublons <b style={{ color: T.orange }}>Quant Toolbox</b> /
          <b style={{ color: T.orange }}> Performance</b> ont été fusionnés (canonical sous Optimisation / Trading).
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {LAB_ITEMS.map((item) => (
          <Panel key={item.id} title={item.title} right={<Badge color={T.yellow}>externe</Badge>}>
            <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.5, minHeight: 44 }}>{item.blurb}</div>
            <div style={{ fontSize: 10.5, color: T.textFaint, margin: "8px 0 12px" }}>{item.providers}</div>
            <Button primary onClick={() => navigate(item.id)}>Ouvrir</Button>
          </Panel>
        ))}
      </div>
    </div>
  );
}

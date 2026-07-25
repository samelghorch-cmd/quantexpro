// Extrait de v4core.js — export CSV + téléchargement fichier.
interface CsvTrade {
  entryTime: number;
  exitTime: number;
  side: number;
  entry: number;
  exit: number;
  pnl: number;
  bars: number;
  reason: string;
}

export function tradesToCSV(trades: CsvTrade[]) {
  const header = "entry_time,exit_time,side,entry,exit,pnl,bars,reason\n";
  const rows = trades.map(t => `${new Date(t.entryTime).toISOString()},${new Date(t.exitTime).toISOString()},${t.side === 1 ? "LONG" : "SHORT"},${t.entry.toFixed(4)},${t.exit.toFixed(4)},${t.pnl.toFixed(2)},${t.bars},${t.reason}`).join("\n");
  return header + rows;
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Télécharge un PDF (Uint8Array / ArrayBuffer / Blob). */
export function downloadPDF(data: BlobPart, filename?: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename || "report.pdf"; a.click();
  URL.revokeObjectURL(url);
}

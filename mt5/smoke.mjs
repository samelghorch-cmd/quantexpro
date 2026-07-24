// Helpers smoke pont MT5 (P3-MT5-VPS) — payloads + client HTTP pour dry-run / API réelle.
// Usage :
//   node mt5/smoke.mjs --dry-run
//   QX_API_BASE_URL=… QX_API_KEY_PM=… QX_API_KEY_EA=… node mt5/smoke.mjs

export function buildPaperSignal(overrides = {}) {
  const id = overrides.client_order_id || `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    client_order_id: id,
    symbol: "EURUSD",
    side: "buy",
    volume: 0.01,
    order_type: "market",
    mode: "paper",
    strategy_id: 1,
    comment: "qx-smoke",
    ...overrides,
  };
}

export function buildFilledAck(clientOrderId, overrides = {}) {
  return {
    client_order_id: clientOrderId,
    status: "filled",
    ticket: 900001,
    filled_price: 1.08512,
    ...overrides,
  };
}

export function buildRejectedAck(clientOrderId, reason = "smoke reject") {
  return {
    client_order_id: clientOrderId,
    status: "rejected",
    reject_reason: reason,
  };
}

/** Valide la forme minimale d'un signal (miroir SignalIn). */
export function assertSignalShape(sig) {
  const errors = [];
  if (!sig || typeof sig !== "object") return ["signal non-objet"];
  if (!sig.client_order_id || String(sig.client_order_id).length > 64) errors.push("client_order_id");
  if (!sig.symbol) errors.push("symbol");
  if (!["buy", "sell", "close"].includes(sig.side)) errors.push("side");
  if (!(Number(sig.volume) > 0)) errors.push("volume");
  if (sig.mode && !["paper", "demo", "live"].includes(sig.mode)) errors.push("mode");
  if (sig.order_type === "limit" && sig.price == null) errors.push("limit sans price");
  return errors;
}

export function assertExecutionShape(ex) {
  const errors = [];
  if (!ex?.client_order_id) errors.push("client_order_id");
  if (!["filled", "rejected"].includes(ex?.status)) errors.push("status");
  if (ex?.status === "filled" && !(Number(ex.filled_price) > 0) && ex.ticket == null) {
    errors.push("filled sans ticket/prix");
  }
  return errors;
}

async function apiJson(baseUrl, apiKey, path, { method = "GET", body } = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const detail = typeof json?.detail === "string" ? json.detail : text;
    throw new Error(`HTTP ${res.status} ${path}: ${detail}`);
  }
  return json;
}

/**
 * Cycle paper : PM crée signal → EA pull → EA ACK filled.
 * @returns {{ ok: boolean, steps: object[], error?: string }}
 */
export async function runMt5SmokeCycle({
  baseUrl,
  pmKey,
  eaKey,
  fetchImpl = fetch,
  mode = "paper",
} = {}) {
  const steps = [];
  try {
    if (!baseUrl || !pmKey || !eaKey) throw new Error("baseUrl, pmKey, eaKey requis");
    const signal = buildPaperSignal({ mode });
    const shapeErr = assertSignalShape(signal);
    if (shapeErr.length) throw new Error(`signal invalide: ${shapeErr.join(",")}`);

    const ack = await apiJson(baseUrl, pmKey, "/v1/mt5/signals", { method: "POST", body: signal }, fetchImpl);
    steps.push({ step: "create_signal", ack });

    const pending = await apiJson(
      baseUrl, eaKey,
      `/v1/mt5/signals/pending?mode=${encodeURIComponent(mode)}&limit=50`,
      {}, fetchImpl,
    );
    steps.push({ step: "pending", count: Array.isArray(pending) ? pending.length : 0 });
    const found = Array.isArray(pending)
      && pending.some((p) => p.client_order_id === signal.client_order_id);
    if (!found) throw new Error("signal créé absent de /pending (rôle ea / mode ?)");

    const exec = buildFilledAck(signal.client_order_id);
    const execErr = assertExecutionShape(exec);
    if (execErr.length) throw new Error(`execution invalide: ${execErr.join(",")}`);

    const result = await apiJson(baseUrl, eaKey, "/v1/mt5/executions", { method: "POST", body: exec }, fetchImpl);
    steps.push({ step: "execution", result });

    return { ok: true, steps, client_order_id: signal.client_order_id };
  } catch (e) {
    return { ok: false, steps, error: e.message || String(e) };
  }
}

// ---- CLI ----
const isMain = process.argv[1] && process.argv[1].endsWith("smoke.mjs");
if (isMain) {
  const dry = process.argv.includes("--dry-run");
  if (dry) {
    const sig = buildPaperSignal({ client_order_id: "smoke-dry-run" });
    const ex = buildFilledAck(sig.client_order_id);
    const se = assertSignalShape(sig);
    const ee = assertExecutionShape(ex);
    if (se.length || ee.length) {
      console.error("dry-run FAIL", { se, ee });
      process.exit(1);
    }
    console.log("dry-run OK", { signal: sig, execution: ex });
    process.exit(0);
  }
  const baseUrl = process.env.QX_API_BASE_URL || "";
  const pmKey = process.env.QX_API_KEY_PM || process.env.QX_API_KEY || "";
  const eaKey = process.env.QX_API_KEY_EA || "";
  const mode = process.env.QX_MT5_SMOKE_MODE || "paper";
  const out = await runMt5SmokeCycle({ baseUrl, pmKey, eaKey, mode });
  if (!out.ok) {
    console.error("smoke FAIL:", out.error);
    console.error(JSON.stringify(out.steps, null, 2));
    process.exit(1);
  }
  console.log("smoke OK", out.client_order_id);
  console.log(JSON.stringify(out.steps, null, 2));
}

// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Extrait de v4core.js — bibliothèque d'indicateurs techniques (IND).
export const IND = {
  sma(arr, n) {
    const out = new Array(arr.length).fill(NaN);
    if (n <= 0) return out;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= n) sum -= arr[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  },
  ema(arr, n) {
    const out = new Array(arr.length).fill(NaN);
    if (n <= 0 || arr.length === 0) return out;
    const k = 2 / (n + 1);
    out[0] = arr[0];
    for (let i = 1; i < arr.length; i++) out[i] = arr[i] * k + out[i - 1] * (1 - k);
    return out;
  },
  wma(arr, n) {
    const out = new Array(arr.length).fill(NaN);
    if (n <= 0) return out;
    for (let i = n - 1; i < arr.length; i++) {
      let s = 0, w = 0;
      for (let j = 0; j < n; j++) { s += arr[i - j] * (n - j); w += (n - j); }
      out[i] = s / w;
    }
    return out;
  },
  dema(arr, n) {
    const e1 = IND.ema(arr, n);
    const e2 = IND.ema(e1, n);
    return arr.map((_, i) => 2 * e1[i] - e2[i]);
  },
  tema(arr, n) {
    const e1 = IND.ema(arr, n);
    const e2 = IND.ema(e1, n);
    const e3 = IND.ema(e2, n);
    return arr.map((_, i) => 3 * (e1[i] - e2[i]) + e3[i]);
  },
  hma(arr, n) {
    const half = Math.max(1, Math.floor(n / 2));
    const w1 = IND.wma(arr, half);
    const w2 = IND.wma(arr, n);
    const diff = arr.map((_, i) => 2 * w1[i] - w2[i]);
    return IND.wma(diff, Math.max(1, Math.floor(Math.sqrt(n))));
  },
  stdev(arr, n) {
    const out = new Array(arr.length).fill(NaN);
    for (let i = n - 1; i < arr.length; i++) {
      let mean = 0;
      for (let j = 0; j < n; j++) mean += arr[i - j];
      mean /= n;
      let v = 0;
      for (let j = 0; j < n; j++) v += (arr[i - j] - mean) ** 2;
      out[i] = Math.sqrt(v / n);
    }
    return out;
  },
  rsi(arr, n = 14) {
    const out = new Array(arr.length).fill(NaN);
    if (arr.length < n + 1) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= n; i++) {
      const d = arr[i] - arr[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    gain /= n; loss /= n;
    out[n] = 100 - 100 / (1 + gain / (loss || 1e-10));
    for (let i = n + 1; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      out[i] = 100 - 100 / (1 + gain / (loss || 1e-10));
    }
    return out;
  },
  atr(highs, lows, closes, n = 14) {
    const tr = new Array(closes.length).fill(0);
    tr[0] = highs[0] - lows[0];
    for (let i = 1; i < closes.length; i++) {
      tr[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
    }
    // Wilder smoothing
    const out = new Array(closes.length).fill(NaN);
    if (tr.length < n) return out;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += tr[i];
    out[n - 1] = sum / n;
    for (let i = n; i < tr.length; i++) out[i] = (out[i - 1] * (n - 1) + tr[i]) / n;
    return out;
  },
  adx(highs, lows, closes, n = 14) {
    const len = closes.length;
    const plusDM = new Array(len).fill(0);
    const minusDM = new Array(len).fill(0);
    const tr = new Array(len).fill(0);
    for (let i = 1; i < len; i++) {
      const up = highs[i] - highs[i - 1];
      const dn = lows[i - 1] - lows[i];
      plusDM[i] = up > dn && up > 0 ? up : 0;
      minusDM[i] = dn > up && dn > 0 ? dn : 0;
      tr[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
    }
    const smooth = (arr) => {
      const o = new Array(len).fill(NaN);
      let s = 0;
      for (let i = 1; i <= n; i++) s += arr[i];
      o[n] = s;
      for (let i = n + 1; i < len; i++) o[i] = o[i - 1] - o[i - 1] / n + arr[i];
      return o;
    };
    const trS = smooth(tr);
    const pS = smooth(plusDM);
    const mS = smooth(minusDM);
    const plusDI = new Array(len).fill(NaN);
    const minusDI = new Array(len).fill(NaN);
    for (let i = n; i < len; i++) {
      plusDI[i] = 100 * pS[i] / (trS[i] || 1e-10);
      minusDI[i] = 100 * mS[i] / (trS[i] || 1e-10);
    }
    const dx = new Array(len).fill(NaN);
    for (let i = n; i < len; i++) {
      const sum = plusDI[i] + minusDI[i];
      dx[i] = sum ? 100 * Math.abs(plusDI[i] - minusDI[i]) / sum : 0;
    }
    const adx = new Array(len).fill(NaN);
    let s = 0;
    for (let i = n; i < 2 * n; i++) s += dx[i];
    if (2 * n < len) adx[2 * n - 1] = s / n;
    for (let i = 2 * n; i < len; i++) adx[i] = (adx[i - 1] * (n - 1) + dx[i]) / n;
    return { plusDI, minusDI, adx };
  },
  bollinger(arr, n = 20, mult = 2) {
    const mid = IND.sma(arr, n);
    const sd = IND.stdev(arr, n);
    const up = arr.map((_, i) => mid[i] + mult * sd[i]);
    const lo = arr.map((_, i) => mid[i] - mult * sd[i]);
    return { mid, up, lo };
  },
  keltner(highs, lows, closes, n = 20, mult = 2) {
    const mid = IND.ema(closes, n);
    const atr = IND.atr(highs, lows, closes, n);
    const up = closes.map((_, i) => mid[i] + mult * atr[i]);
    const lo = closes.map((_, i) => mid[i] - mult * atr[i]);
    return { mid, up, lo, atr };
  },
  donchian(highs, lows, n = 20) {
    const up = new Array(highs.length).fill(NaN);
    const lo = new Array(highs.length).fill(NaN);
    for (let i = n - 1; i < highs.length; i++) {
      let hi = -Infinity, low = Infinity;
      for (let j = 0; j < n; j++) {
        hi = Math.max(hi, highs[i - j]);
        low = Math.min(low, lows[i - j]);
      }
      up[i] = hi; lo[i] = low;
    }
    const mid = up.map((h, i) => (h + lo[i]) / 2);
    return { up, lo, mid };
  },
  superTrend(highs, lows, closes, n = 10, mult = 3) {
    const atr = IND.atr(highs, lows, closes, n);
    const len = closes.length;
    const hl2 = closes.map((_, i) => (highs[i] + lows[i]) / 2);
    const upperBasic = hl2.map((h, i) => h + mult * atr[i]);
    const lowerBasic = hl2.map((h, i) => h - mult * atr[i]);
    const upperBand = [...upperBasic];
    const lowerBand = [...lowerBasic];
    const dir = new Array(len).fill(1);
    const st = new Array(len).fill(NaN);
    st[0] = lowerBasic[0];
    for (let i = 1; i < len; i++) {
      upperBand[i] = upperBasic[i] < upperBand[i - 1] || closes[i - 1] > upperBand[i - 1] ? upperBasic[i] : upperBand[i - 1];
      lowerBand[i] = lowerBasic[i] > lowerBand[i - 1] || closes[i - 1] < lowerBand[i - 1] ? lowerBasic[i] : lowerBand[i - 1];
      if (dir[i - 1] === 1 && closes[i] < lowerBand[i]) dir[i] = -1;
      else if (dir[i - 1] === -1 && closes[i] > upperBand[i]) dir[i] = 1;
      else dir[i] = dir[i - 1];
      st[i] = dir[i] === 1 ? lowerBand[i] : upperBand[i];
    }
    return { st, dir };
  },
  vwap(highs, lows, closes, volumes) {
    const out = new Array(closes.length).fill(NaN);
    let cumPV = 0, cumV = 0;
    let lastDay = -1;
    for (let i = 0; i < closes.length; i++) {
      // reset chaque "jour" tous les 78 bars (session 5min)
      const day = Math.floor(i / 78);
      if (day !== lastDay) { cumPV = 0; cumV = 0; lastDay = day; }
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      cumPV += tp * volumes[i];
      cumV += volumes[i];
      out[i] = cumV ? cumPV / cumV : NaN;
    }
    return out;
  },
  macd(arr, fast = 12, slow = 26, signal = 9) {
    const f = IND.ema(arr, fast);
    const s = IND.ema(arr, slow);
    const macd = arr.map((_, i) => f[i] - s[i]);
    const sig = IND.ema(macd, signal);
    const hist = macd.map((m, i) => m - sig[i]);
    return { macd, sig, hist };
  },
  stoch(highs, lows, closes, n = 14, dPeriod = 3) {
    const k = new Array(closes.length).fill(NaN);
    for (let i = n - 1; i < closes.length; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = 0; j < n; j++) {
        hi = Math.max(hi, highs[i - j]);
        lo = Math.min(lo, lows[i - j]);
      }
      k[i] = ((closes[i] - lo) / (hi - lo || 1e-10)) * 100;
    }
    const d = IND.sma(k, dPeriod);
    return { k, d };
  },
  cci(highs, lows, closes, n = 20) {
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    const sma = IND.sma(tp, n);
    const out = new Array(closes.length).fill(NaN);
    for (let i = n - 1; i < closes.length; i++) {
      let md = 0;
      for (let j = 0; j < n; j++) md += Math.abs(tp[i - j] - sma[i]);
      md /= n;
      out[i] = (tp[i] - sma[i]) / (0.015 * (md || 1e-10));
    }
    return out;
  },
  wpr(highs, lows, closes, n = 14) {
    const out = new Array(closes.length).fill(NaN);
    for (let i = n - 1; i < closes.length; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = 0; j < n; j++) {
        hi = Math.max(hi, highs[i - j]);
        lo = Math.min(lo, lows[i - j]);
      }
      out[i] = ((hi - closes[i]) / (hi - lo || 1e-10)) * -100;
    }
    return out;
  },
  mfi(highs, lows, closes, volumes, n = 14) {
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    const rmf = tp.map((v, i) => v * volumes[i]);
    const out = new Array(closes.length).fill(NaN);
    for (let i = n; i < closes.length; i++) {
      let pos = 0, neg = 0;
      for (let j = 0; j < n; j++) {
        if (tp[i - j] > tp[i - j - 1]) pos += rmf[i - j];
        else if (tp[i - j] < tp[i - j - 1]) neg += rmf[i - j];
      }
      const mr = pos / (neg || 1e-10);
      out[i] = 100 - 100 / (1 + mr);
    }
    return out;
  },
  obv(closes, volumes) {
    const out = new Array(closes.length).fill(0);
    for (let i = 1; i < closes.length; i++) {
      out[i] = out[i - 1] + (closes[i] > closes[i - 1] ? volumes[i] : closes[i] < closes[i - 1] ? -volumes[i] : 0);
    }
    return out;
  },
  cmf(highs, lows, closes, volumes, n = 20) {
    const out = new Array(closes.length).fill(NaN);
    const mfv = closes.map((c, i) => {
      const r = highs[i] - lows[i];
      return r === 0 ? 0 : ((c - lows[i]) - (highs[i] - c)) / r * volumes[i];
    });
    for (let i = n - 1; i < closes.length; i++) {
      let s = 0, v = 0;
      for (let j = 0; j < n; j++) { s += mfv[i - j]; v += volumes[i - j]; }
      out[i] = v ? s / v : NaN;
    }
    return out;
  },
  roc(arr, n = 10) {
    const out = new Array(arr.length).fill(NaN);
    for (let i = n; i < arr.length; i++) out[i] = 100 * (arr[i] / arr[i - n] - 1);
    return out;
  },
  momentum(arr, n = 10) {
    const out = new Array(arr.length).fill(NaN);
    for (let i = n; i < arr.length; i++) out[i] = arr[i] - arr[i - n];
    return out;
  },
  zscore(arr, n = 20) {
    const mean = IND.sma(arr, n);
    const sd = IND.stdev(arr, n);
    return arr.map((v, i) => (v - mean[i]) / (sd[i] || 1e-10));
  },
  /** Kaufman Adaptive Moving Average — causal. */
  kama(arr, n = 10, fast = 2, slow = 30) {
    const out = new Array(arr.length).fill(NaN);
    if (!arr?.length || n < 1) return out;
    const fastSC = 2 / (fast + 1);
    const slowSC = 2 / (slow + 1);
    let seed = n - 1;
    while (seed < arr.length && !Number.isFinite(arr[seed])) seed++;
    if (seed >= arr.length) return out;
    out[seed] = arr[seed];
    for (let i = seed + 1; i < arr.length; i++) {
      if (!Number.isFinite(arr[i]) || !Number.isFinite(out[i - 1])) {
        out[i] = out[i - 1];
        continue;
      }
      if (i < n) {
        out[i] = out[i - 1] + (2 / (n + 1)) * (arr[i] - out[i - 1]);
        continue;
      }
      const change = Math.abs(arr[i] - arr[i - n]);
      let volatility = 0;
      for (let j = 0; j < n; j++) {
        const a = arr[i - j];
        const b = arr[i - j - 1];
        if (Number.isFinite(a) && Number.isFinite(b)) volatility += Math.abs(a - b);
      }
      const er = volatility > 0 ? change / volatility : 0;
      const sc = (er * (fastSC - slowSC) + slowSC) ** 2;
      out[i] = out[i - 1] + sc * (arr[i] - out[i - 1]);
    }
    return out;
  },
  /** Endpoint de régression linéaire (fenêtre n) — causal. */
  linreg(arr, n = 20) {
    const out = new Array(arr.length).fill(NaN);
    if (!(n > 1)) return out;
    for (let i = n - 1; i < arr.length; i++) {
      let sx = 0, sy = 0, sxy = 0, sx2 = 0, cnt = 0;
      for (let j = 0; j < n; j++) {
        const y = arr[i - n + 1 + j];
        if (!Number.isFinite(y)) continue;
        const x = j;
        sx += x; sy += y; sxy += x * y; sx2 += x * x; cnt++;
      }
      if (cnt < n * 0.8) continue;
      const den = cnt * sx2 - sx * sx;
      const slope = den ? (cnt * sxy - sx * sy) / den : 0;
      const intercept = (sy - slope * sx) / cnt;
      out[i] = intercept + slope * (n - 1);
    }
    return out;
  },
  psar(highs, lows, closes, step = 0.02, max = 0.2) {
    const len = closes.length;
    const sar = new Array(len).fill(NaN);
    let bull = true;
    let af = step;
    let ep = highs[0];
    sar[0] = lows[0];
    for (let i = 1; i < len; i++) {
      sar[i] = sar[i - 1] + af * (ep - sar[i - 1]);
      if (bull) {
        if (lows[i] < sar[i]) {
          bull = false; sar[i] = ep; ep = lows[i]; af = step;
        } else {
          if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + step, max); }
          sar[i] = Math.min(sar[i], lows[i - 1], lows[i]);
        }
      } else {
        if (highs[i] > sar[i]) {
          bull = true; sar[i] = ep; ep = highs[i]; af = step;
        } else {
          if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + step, max); }
          sar[i] = Math.max(sar[i], highs[i - 1], highs[i]);
        }
      }
    }
    return sar;
  },
  ichimoku(highs, lows, closes, tenkan = 9, kijun = 26, senkou = 52) {
    const midpoint = (n) => {
      const out = new Array(closes.length).fill(NaN);
      for (let i = n - 1; i < closes.length; i++) {
        let hi = -Infinity, lo = Infinity;
        for (let j = 0; j < n; j++) {
          hi = Math.max(hi, highs[i - j]);
          lo = Math.min(lo, lows[i - j]);
        }
        out[i] = (hi + lo) / 2;
      }
      return out;
    };
    const tk = midpoint(tenkan);
    const kj = midpoint(kijun);
    const spanA = tk.map((v, i) => (v + kj[i]) / 2);
    const spanB = midpoint(senkou);
    return { tk, kj, spanA, spanB };
  },
  stochRSI(arr, n = 14) {
    const rsi = IND.rsi(arr, n);
    const out = new Array(arr.length).fill(NaN);
    for (let i = n * 2 - 1; i < arr.length; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = 0; j < n; j++) {
        if (!isNaN(rsi[i - j])) { hi = Math.max(hi, rsi[i - j]); lo = Math.min(lo, rsi[i - j]); }
      }
      out[i] = (rsi[i] - lo) / (hi - lo || 1e-10);
    }
    return out;
  },
  // Métriques statistiques
  skew(arr, n) {
    const out = new Array(arr.length).fill(NaN);
    for (let i = n - 1; i < arr.length; i++) {
      let mean = 0;
      for (let j = 0; j < n; j++) mean += arr[i - j];
      mean /= n;
      let m2 = 0, m3 = 0;
      for (let j = 0; j < n; j++) { const d = arr[i - j] - mean; m2 += d * d; m3 += d * d * d; }
      if (m2 > 0) out[i] = (m3 / n) / Math.pow(m2 / n, 1.5);
    }
    return out;
  },
  kurt(arr, n) {
    const out = new Array(arr.length).fill(NaN);
    for (let i = n - 1; i < arr.length; i++) {
      let mean = 0;
      for (let j = 0; j < n; j++) mean += arr[i - j];
      mean /= n;
      let m2 = 0, m4 = 0;
      for (let j = 0; j < n; j++) { const d = arr[i - j] - mean; m2 += d * d; m4 += d * d * d * d; }
      if (m2 > 0) out[i] = (m4 / n) / Math.pow(m2 / n, 2) - 3;
    }
    return out;
  },
  hurst(arr, n = 100) {
    const out = new Array(arr.length).fill(NaN);
    for (let idx = n - 1; idx < arr.length; idx++) {
      const maxLag = Math.min(20, Math.floor(n / 2));
      let sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
      let ok = true;
      for (let lag = 2; lag < maxLag && ok; lag++) {
        let sum = 0;
        const w = n - lag;
        for (let j = 0; j < w; j++) sum += arr[idx - j] - arr[idx - j - lag];
        const mean = sum / w;
        let vr = 0;
        for (let j = 0; j < w; j++) { const d = arr[idx - j] - arr[idx - j - lag] - mean; vr += d * d; }
        vr /= w;
        if (vr <= 0) { ok = false; break; }
        const x = Math.log(lag);
        const y = 0.5 * Math.log(vr);
        sx += x; sy += y; sxx += x * x; sxy += x * y; cnt++;
      }
      if (ok && cnt >= 2) {
        const den = cnt * sxx - sx * sx;
        out[idx] = den === 0 ? 0.5 : (cnt * sxy - sx * sy) / den;
      } else out[idx] = 0.5;
    }
    return out;
  },
  // VPIN (microstructure — Easley/Lopez/O'Hara)
  vpin(closes, volumes, bucket = 50, window = 20) {
    const out = new Array(closes.length).fill(NaN);
    const buckets = [];
    let cumV = 0, buyV = 0, sellV = 0;
    let lastPrice = closes[0];
    for (let i = 0; i < closes.length; i++) {
      const dp = closes[i] - lastPrice;
      const sign = dp > 0 ? 1 : dp < 0 ? -1 : 0;
      if (sign > 0) buyV += volumes[i];
      else if (sign < 0) sellV += volumes[i];
      else { buyV += volumes[i] / 2; sellV += volumes[i] / 2; }
      cumV += volumes[i];
      lastPrice = closes[i];
      if (cumV >= bucket) {
        buckets.push(Math.abs(buyV - sellV) / (buyV + sellV || 1e-10));
        cumV = 0; buyV = 0; sellV = 0;
        if (buckets.length >= window) {
          const slice = buckets.slice(-window);
          out[i] = slice.reduce((a, b) => a + b, 0) / window;
        }
      }
    }
    return out;
  },
};

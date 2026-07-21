// Extrait de v4core.js — specs contrats futures (point value, tick, frais).
export const CONTRACTS = {
  ES:  { name: "E-mini S&P 500",  pv: 50,   tick: 0.25,  commission: 2.50, slippage: 1 },
  MES: { name: "Micro E-mini S&P",pv: 5,    tick: 0.25,  commission: 0.85, slippage: 1 },
  NQ:  { name: "E-mini Nasdaq",   pv: 20,   tick: 0.25,  commission: 2.50, slippage: 1 },
  MNQ: { name: "Micro E-mini NQ", pv: 2,    tick: 0.25,  commission: 0.85, slippage: 1 },
  YM:  { name: "E-mini Dow",      pv: 5,    tick: 1.00,  commission: 2.50, slippage: 1 },
  CL:  { name: "Crude Oil",       pv: 1000, tick: 0.01,  commission: 3.10, slippage: 1 },
  GC:  { name: "Gold",            pv: 100,  tick: 0.10,  commission: 3.10, slippage: 1 },
  "6E":{ name: "Euro FX",         pv: 125000,tick: 0.00005,commission: 2.50, slippage: 1 },
};

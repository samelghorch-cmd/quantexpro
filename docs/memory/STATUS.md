# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P2-MQL5)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **213** · backend **51** |
| Commit HEAD | P2-MQL5 |
| P0 | ✅ clôturé |
| P1 | ✅ clôturé + re-vérifié |
| P2 | 🔄 L2 ✅ · DUKA ✅ · MQL5 ✅ · reste Labs UI, … |
| Prochaine action | **P2-UI** Labs + fusion nav — dire « go » |

---

## P2 — ordre des chantiers

1. ~~Binance L2 WS~~ ✅  
2. ~~Dukascopy batch historique~~ ✅  
3. ~~Export MQL5 EA~~ ✅  
4. **UI Labs + fusion nav** ← prochain  
5. (optionnel) Next.js/TS · scrapers  

### P2-MQL5 — livré

- `src/engine/mql5Export.js` — 5 familles (maCross, rsiRev, macdCross, donchianBreak, bbBounce)
- Meta IDs canoniques + warning proxy ; stub si non supporté
- UI : Strategy Builder + Mes Stratégies (remplace stubs commentaires)
- Tests : `mql5Export.test.js` (10)
- Ne touche pas `mt5/QuantEXProBridge.mq5` (pont API ≠ EA signal)

### P2-DUKA — livré

- `dukascopyImport.js` + fetch:deep / validate + Data Manager

---

## Notes session

- Un chantier à la fois ; dire **« go »** pour le suivant.  
- Après `src/engine/*` → `npm test` obligatoire.

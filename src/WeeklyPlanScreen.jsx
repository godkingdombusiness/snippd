import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMission } from "@/hooks/useMission";
import { fetchActiveOffers } from "@/lib/fetchOffers";
import {
  buildStrategiesByStore,
  orderedStores,
  STORE_DEFS,
} from "@/lib/strategyEngine";
import { emitBundleLocked } from "@/lib/behavior";

const STRATEGY_ORDER = [
  { key: "budget", title: "Budget" },
  { key: "quick", title: "Quick" },
  { key: "chef", title: "Chef" },
];

function formatMoney(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

export default function WeeklyPlanScreen() {
  const nav = useNavigate();
  const { mission, userId, patchMission, lockBundleToMission } = useMission();
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const budgetCents = mission.weeklyBudgetCents ?? 0;

  const storeOrder = useMemo(
    () => orderedStores(mission.preferredStores ?? []),
    [mission.preferredStores]
  );

  const visibleStores = useMemo(() => {
    if (!mission.storeFilterId) return storeOrder;
    return storeOrder.filter((s) => s.id === mission.storeFilterId);
  }, [mission.storeFilterId, storeOrder]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mission.strategiesByStore) return;
      setLoading(true);
      setErr("");
      try {
        const offers = await fetchActiveOffers();
        if (cancelled) return;
        const strategiesByStore = buildStrategiesByStore(
          offers,
          mission.weekOf,
          budgetCents
        );
        patchMission({ strategiesByStore });
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mission.strategiesByStore, mission.weekOf, budgetCents, patchMission]);

  const selectedStore = mission.selectedStoreId ?? "walmart";
  const selectedStrategy = mission.selectedStrategyKey ?? "budget";

  return (
    <div className="snippd-screen">
      <header className="snippd-header">
        <h1>Weekly plan</h1>
        <p className="snippd-muted">
          Exactly three strategies per store (Budget, Quick, Chef). Each bundle is{" "}
          <strong>7 dinners + 1 household essentials</strong> stack.
        </p>
      </header>

      <section className="snippd-section">
        <label className="snippd-inline">
          Weekly budget ($)
          <input
            type="number"
            min={1}
            step={1}
            value={Math.round(budgetCents / 100)}
            onChange={(e) =>
              patchMission({
                weeklyBudgetCents: Math.max(1, Number(e.target.value) || 0) * 100,
              })
            }
          />
        </label>
      </section>

      <section className="snippd-section">
        <div className="snippd-filter-bar">
          <span className="snippd-filter-label">Stores</span>
          <button
            type="button"
            className={!mission.storeFilterId ? "snippd-chip active" : "snippd-chip"}
            onClick={() => patchMission({ storeFilterId: null })}
          >
            All
          </button>
          {storeOrder.map((s) => {
            const pinned = (mission.preferredStores ?? []).includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={
                  mission.storeFilterId === s.id
                    ? "snippd-chip active"
                    : pinned
                      ? "snippd-chip pinned"
                      : "snippd-chip"
                }
                onClick={() =>
                  patchMission({
                    storeFilterId: mission.storeFilterId === s.id ? null : s.id,
                  })
                }
              >
                {s.name}
                {pinned ? " ★" : ""}
              </button>
            );
          })}
        </div>
      </section>

      {loading ? <p>Building strategies…</p> : null}
      {err ? <p className="snippd-error">{err}</p> : null}

      {mission.strategiesByStore
        ? STRATEGY_ORDER.map((row) => (
            <section key={row.key} className="snippd-section">
              <h2>{row.title}</h2>
              <div className="snippd-compare-row">
                {visibleStores.map((store) => {
                  const cell = mission.strategiesByStore[store.id]?.[row.key];
                  const total = cell?.displayTotalCents;
                  const active =
                    selectedStore === store.id && selectedStrategy === row.key;
                  return (
                    <button
                      key={store.id}
                      type="button"
                      className={
                        active ? "snippd-compare-card selected" : "snippd-compare-card"
                      }
                      onClick={() =>
                        patchMission({
                          selectedStoreId: store.id,
                          selectedStrategyKey: row.key,
                        })
                      }
                    >
                      <div className="snippd-compare-title">{store.name}</div>
                      <div className="snippd-compare-price">{formatMoney(total)}</div>
                      <div className="snippd-compare-sub">7 dinners + essentials</div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        : null}

      <section className="snippd-section snippd-actions">
        <button
          type="button"
          className="snippd-primary wide"
          disabled={!mission.strategiesByStore}
          onClick={() => {
            lockBundleToMission(
              selectedStore,
              selectedStrategy,
              mission.strategiesByStore
            );
            if (userId) {
              const storeMeta = STORE_DEFS.find((s) => s.id === selectedStore);
              const picked =
                mission.strategiesByStore?.[selectedStore]?.[selectedStrategy];
              const bundle = picked?.bundle;
              if (bundle && storeMeta) {
                const today = new Date().toISOString().slice(0, 10);
                const bundleId = `${userId}:${storeMeta.id}:${selectedStrategy}:${today}`;
                const dinners = (bundle.dinners ?? []).flatMap((d) =>
                  (d.items ?? []).map((it) => ({
                    name: it.headline,
                    role: "dinner",
                  }))
                );
                const essentials = (
                  bundle.household_essentials?.items ?? []
                ).map((it) => ({ name: it.headline, role: "essential" }));
                emitBundleLocked({
                  userId,
                  bundleId,
                  strategy: selectedStrategy,
                  storeSlug: storeMeta.id,
                  budgetCents,
                  products: [...dinners, ...essentials],
                });
              }
            }
            nav("/list");
          }}
        >
          Add to Cart
        </button>
      </section>

      <details className="snippd-details">
        <summary>Store reference</summary>
        <ul>
          {STORE_DEFS.map((s) => (
            <li key={s.id}>
              {s.name} — multiplier {(s.priceMultiplierBps / 100).toFixed(2)}×
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

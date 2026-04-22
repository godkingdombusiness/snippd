import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMission } from "@/hooks/useMission";
import { fetchActiveOffers } from "@/lib/fetchOffers";
import { findBudgetSafeReplacement } from "@/lib/missionShoppingList";
import { estimateLineCents } from "@/lib/generateMealStack";
import { STORE_DEFS } from "@/lib/strategyEngine";
import { emitItemUnavailable } from "@/lib/behavior";

export default function MyListScreen() {
  const nav = useNavigate();
  const { mission, userId, patchMission } = useMission();
  const [missing, setMissing] = useState(null);
  const [replacement, setReplacement] = useState(null);

  const links = mission.preShopTourLinks ?? [];
  const idx = mission.preShopTourIndex ?? 0;

  const allChecked = useMemo(() => {
    const rows = mission.shoppingList ?? [];
    return rows.length > 0 && rows.every((i) => i.checked);
  }, [mission.shoppingList]);

  const list = mission.shoppingList ?? [];

  function toggle(id) {
    const next = list.map((i) =>
      i.id === id ? { ...i, checked: !i.checked } : i
    );
    patchMission({ shoppingList: next });
  }

  function openTourLink(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function openNotFound(item) {
    setMissing(item);
    setReplacement(null);
    if (userId && item?.label && item?.storeId) {
      emitItemUnavailable({
        userId,
        bundleId: mission?.activeBundle?.bundleId ?? null,
        storeSlug: item.storeId,
        productName: item.label,
      });
    }
    try {
      const offers = await fetchActiveOffers();
      const rep = findBudgetSafeReplacement(offers, item);
      setReplacement(rep);
    } catch {
      setReplacement(null);
    }
  }

  function applyReplacement() {
    if (!missing || !replacement) return;
    if (userId && missing.label && missing.storeId) {
      emitItemUnavailable({
        userId,
        bundleId: mission?.activeBundle?.bundleId ?? null,
        storeSlug: missing.storeId,
        productName: missing.label,
        replacementName: replacement.headline,
      });
    }
    const next = list.map((i) =>
      i.id === missing.id
        ? {
            ...i,
            offerId: replacement.id,
            label: replacement.headline,
            category: replacement.category,
            cents: estimateLineCents(replacement),
            checked: false,
          }
        : i
    );
    patchMission({ shoppingList: next });
    setMissing(null);
    setReplacement(null);
  }

  function headToCheckout() {
    const retailCents = list.reduce((s, x) => s + (x.cents || 0), 0);
    patchMission({
      phase: "shop",
      checkout: {
        ...mission.checkout,
        retailCents,
        ibottaFetchCents: mission.checkout.ibottaFetchCents ?? 0,
        loyaltyCents: mission.checkout.loyaltyCents ?? 0,
      },
    });
    nav("/checkout");
  }

  const store = STORE_DEFS.find((s) => s.id === mission.activeBundle?.storeId);

  return (
    <div className="snippd-screen">
      <h1>Pre-shop &amp; smart list</h1>
      <p className="snippd-muted">
        Link-by-link tour for <strong>{store?.name ?? "your store"}</strong>. Check off
        items as you add them to the cart.
      </p>

      <section className="snippd-section">
        <h2>Browser tour</h2>
        {links.length ? (
          <ol className="snippd-tour">
            {links.map((l, i) => (
              <li key={l.url + i}>
                <button
                  type="button"
                  className="snippd-linkish"
                  onClick={() => openTourLink(l.url)}
                >
                  {l.label}
                </button>
                {i === idx ? <span className="snippd-pill">current</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="snippd-muted">
            Lock a bundle on the plan screen to generate tour links from your active
            mission.
          </p>
        )}
        <div className="snippd-row">
          <button
            type="button"
            onClick={() =>
              patchMission({
                preShopTourIndex: Math.min(idx + 1, Math.max(0, links.length - 1)),
              })
            }
          >
            Next tour stop
          </button>
        </div>
      </section>

      <section className="snippd-section">
        <h2>My list</h2>
        {!list.length ? (
          <p className="snippd-muted">No list yet — add a bundle from Weekly plan.</p>
        ) : (
          <ul className="snippd-checklist">
            {list.map((item) => (
              <li key={item.id} className="snippd-check-row">
                <label>
                  <input
                    type="checkbox"
                    checked={!!item.checked}
                    onChange={() => toggle(item.id)}
                  />
                  <span>
                    {item.label}{" "}
                    <span className="snippd-muted">
                      (${((item.cents || 0) / 100).toFixed(2)})
                    </span>
                  </span>
                </label>
                <button type="button" onClick={() => openNotFound(item)}>
                  Item not found
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="snippd-section snippd-actions">
        <button
          type="button"
          className="snippd-primary wide"
          disabled={!allChecked}
          onClick={headToCheckout}
        >
          Head to Checkout
        </button>
        {!allChecked && list.length ? (
          <p className="snippd-muted">
            Checkout unlocks when <strong>100%</strong> of items are checked.
          </p>
        ) : null}
      </section>

      {missing ? (
        <div className="snippd-modal-overlay" role="dialog">
          <div className="snippd-modal">
            <h3>Item not found</h3>
            <p>
              <strong>{missing.label}</strong> (~
              {((missing.cents || 0) / 100).toFixed(2)})
            </p>
            {replacement ? (
              <p>
                Budget-safe replacement:{" "}
                <strong>{replacement.headline}</strong> (
                {((estimateLineCents(replacement) || 0) / 100).toFixed(2)})
              </p>
            ) : (
              <p className="snippd-muted">No close match in this category.</p>
            )}
            <div className="snippd-row">
              <button type="button" onClick={() => setMissing(null)}>
                Close
              </button>
              <button
                type="button"
                disabled={!replacement}
                onClick={applyReplacement}
              >
                Use replacement
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

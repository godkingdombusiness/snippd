import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMission } from "@/hooks/useMission";

function formatMoney(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

export default function CheckoutScreen() {
  const nav = useNavigate();
  const { mission, patchMission } = useMission();

  const retail = mission.checkout?.retailCents;
  const ibotta = mission.checkout?.ibottaFetchCents ?? 0;
  const loyalty = mission.checkout?.loyaltyCents ?? 0;

  const snippd = useMemo(() => {
    const r = Number(retail) || 0;
    return Math.max(0, r - Number(ibotta) - Number(loyalty));
  }, [retail, ibotta, loyalty]);

  return (
    <div className="snippd-screen">
      <h1>True cost checkout</h1>
      <p className="snippd-muted">
        All values are read from your <code>active_mission</code> checkout slice — no
        demo constants.
      </p>

      <section className="snippd-section snippd-stack">
        <label>
          Retail total ({formatMoney(retail)})
          <input
            type="number"
            min={0}
            step={1}
            value={retail == null ? "" : Math.round(retail / 100)}
            onChange={(e) =>
              patchMission({
                checkout: {
                  ...mission.checkout,
                  retailCents: Math.max(0, Number(e.target.value) || 0) * 100,
                },
              })
            }
          />
        </label>
        <label>
          Ibotta + Fetch ({formatMoney(ibotta)})
          <input
            type="number"
            min={0}
            step={1}
            value={Math.round(ibotta / 100)}
            onChange={(e) =>
              patchMission({
                checkout: {
                  ...mission.checkout,
                  ibottaFetchCents: Math.max(0, Number(e.target.value) || 0) * 100,
                },
              })
            }
          />
        </label>
        <label>
          Loyalty ({formatMoney(loyalty)})
          <input
            type="number"
            min={0}
            step={1}
            value={Math.round(loyalty / 100)}
            onChange={(e) =>
              patchMission({
                checkout: {
                  ...mission.checkout,
                  loyaltyCents: Math.max(0, Number(e.target.value) || 0) * 100,
                },
              })
            }
          />
        </label>
      </section>

      <section className="snippd-hero snippd-section">
        <div className="snippd-formula">
          {formatMoney(retail)} − {formatMoney(ibotta)} − {formatMoney(loyalty)} ={" "}
          <strong>{formatMoney(snippd)}</strong>
        </div>
        <p className="snippd-muted">Snippd price (after cash-back &amp; loyalty)</p>
      </section>

      <section className="snippd-section snippd-actions">
        <button
          type="button"
          className="snippd-primary"
          onClick={() => {
            patchMission({
              phase: "verify",
              receipt: {
                ...mission.receipt,
                plannedItems: mission.shoppingList ?? [],
                actualItems: mission.shoppingList ?? [],
                unplannedItems: [],
              },
            });
            nav("/verify");
          }}
        >
          Finish &amp; verify receipt
        </button>
      </section>
    </div>
  );
}

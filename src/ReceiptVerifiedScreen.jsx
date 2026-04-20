import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMission } from "@/hooks/useMission";
import { writeUnplannedPreferenceToNeo4j } from "@/lib/neo4jPreference";
import { countUserReceipts } from "@/lib/receiptStats";
import { supabase } from "@/lib/supabase";

function ids(items) {
  return new Set((items ?? []).map((i) => i.offerId ?? i.id).filter(Boolean));
}

function uid() {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ReceiptVerifiedScreen() {
  const nav = useNavigate();
  const { mission, patchMission, userId } = useMission();
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [extraActual, setExtraActual] = useState("");

  const unplanned = useMemo(() => {
    const planned = mission.receipt?.plannedItems ?? [];
    const actual = mission.receipt?.actualItems ?? [];
    const p = ids(planned);
    return (actual ?? []).filter((i) => !p.has(i.offerId ?? i.id));
  }, [mission.receipt?.plannedItems, mission.receipt?.actualItems]);

  const planned = mission.receipt?.plannedItems ?? [];
  const actual = mission.receipt?.actualItems ?? [];

  async function savePreference() {
    setStatus("");
    try {
      await writeUnplannedPreferenceToNeo4j({
        userId,
        saveForNextWeek: /yes|save|y/i.test(answer),
        unplannedItemLabels: unplanned.map((u) => u.label),
        aiPromptResponse: answer,
      });
      setStatus("Preference recorded (Neo4j ingest when configured).");
    } catch (e) {
      setStatus(e?.message ?? String(e));
    }
  }

  function addActualLine() {
    if (!extraActual.trim()) return;
    const line = {
      id: uid(),
      label: extraActual.trim(),
      offerId: null,
      cents: null,
    };
    patchMission({
      receipt: {
        ...mission.receipt,
        actualItems: [...(mission.receipt?.actualItems ?? []), line],
      },
    });
    setExtraActual("");
  }

  async function bumpReceiptDemo() {
    if (!userId) return;
    const { error } = await supabase.from("trips").insert({
      user_id: userId,
      week_of: mission.weekOf,
      budget_cents: mission.weeklyBudgetCents ?? 0,
      spent_cents: mission.checkout?.retailCents ?? 0,
      verified_savings_cents: mission.checkout?.ibottaFetchCents ?? 0,
      estimated_savings_cents: mission.checkout?.loyaltyCents ?? 0,
    });
    if (error) {
      setStatus(error.message);
      return;
    }
    const nextCount = await countUserReceipts(userId);
    patchMission({ receiptCount: nextCount });
    setStatus(`Receipt logged. Count is now ${nextCount}.`);
  }

  return (
    <div className="snippd-screen">
      <h1>Receipt verified</h1>
      <p className="snippd-muted">
        Compare <strong>planned_items</strong> vs <strong>actual_items</strong> from
        your mission.
      </p>

      <section className="snippd-section snippd-two-col">
        <div>
          <h2>Planned</h2>
          <ul>
            {planned.map((p) => (
              <li key={p.id ?? p.offerId}>{p.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Actual</h2>
          <ul>
            {actual.map((p) => (
              <li key={p.id ?? p.offerId}>{p.label}</li>
            ))}
          </ul>
          <div className="snippd-row" style={{ marginTop: "0.75rem" }}>
            <input
              type="text"
              value={extraActual}
              onChange={(e) => setExtraActual(e.target.value)}
              placeholder="Add actual-only line item"
            />
            <button type="button" onClick={addActualLine}>
              Add
            </button>
          </div>
        </div>
      </section>

      {unplanned.length ? (
        <section className="snippd-section">
          <h2>Unplanned items</h2>
          <ul>
            {unplanned.map((u) => (
              <li key={u.id ?? u.label}>{u.label}</li>
            ))}
          </ul>
          <p className="snippd-muted">
            Save this preference for next week? Tell the AI below (yes/no) — we write
            the structured response to Neo4j when{" "}
            <code>VITE_NEO4J_PREFERENCE_URL</code> is configured.
          </p>
          <textarea
            rows={3}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="e.g. Yes, keep buying that brand of yogurt"
          />
          <div className="snippd-row">
            <button type="button" onClick={savePreference}>
              Save preference
            </button>
          </div>
        </section>
      ) : (
        <p className="snippd-muted">No unplanned items detected.</p>
      )}

      {status ? <p className="snippd-msg">{status}</p> : null}

      <section className="snippd-section snippd-actions">
        <button type="button" onClick={bumpReceiptDemo}>
          Log demo receipt (increments receipt_count)
        </button>
        <button type="button" onClick={() => nav("/chef")}>
          Chef stash
        </button>
        <button type="button" onClick={() => nav("/studio")}>
          Snippd Studio
        </button>
      </section>
    </div>
  );
}

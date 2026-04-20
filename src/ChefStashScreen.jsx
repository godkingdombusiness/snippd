import { useNavigate } from "react-router-dom";
import { useMission } from "@/hooks/useMission";

export default function ChefStashScreen() {
  const nav = useNavigate();
  const { mission } = useMission();

  const dinners = mission.activeBundle?.bundle?.dinners ?? [];

  return (
    <div className="snippd-screen">
      <h1>Chef stash</h1>
      <p className="snippd-muted">
        Tap a meal to open the AI Chef lane with a <strong>Record my creation</strong>{" "}
        prompt (60s video prep).
      </p>

      <ul className="snippd-meals">
        {dinners.map((d) => (
          <li key={d.slot}>
            <button
              type="button"
              className="snippd-meal-card"
              onClick={() =>
                nav(`/chef/${d.slot}`, {
                  state: {
                    prompt:
                      "Record my creation: narrate prep for this meal in under 60 seconds.",
                    slot: d.slot,
                  },
                })
              }
            >
              <div className="snippd-meal-title">Night {d.slot}</div>
              <div className="snippd-meal-sub">
                {(d.items ?? [])
                  .map((i) => i.headline)
                  .filter(Boolean)
                  .join(" · ") || "Open chef view"}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {!dinners.length ? (
        <p className="snippd-muted">Lock a mission bundle to see your dinners.</p>
      ) : null}
    </div>
  );
}

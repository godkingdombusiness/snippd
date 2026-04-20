import { useState } from "react";
import { useMission } from "@/hooks/useMission";
import { supabase } from "@/lib/supabase";

export default function StudioScreen() {
  const { mission, userId, patchMission } = useMission();
  const [msg, setMsg] = useState("");

  const unlocked = (mission.receiptCount ?? 0) >= 3;

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setMsg("");
    const path = `${userId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error } = await supabase.storage.from("ugc-videos").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    patchMission({ phase: "studio", lastUgcPath: path });
    setMsg(`Uploaded to storage: ${path}`);
  }

  return (
    <div className="snippd-screen">
      <h1>Snippd Studio</h1>
      {!unlocked ? (
        <div className="snippd-locked">
          <p>
            Studio unlocks when <strong>receipt_count ≥ 3</strong>. Current count:{" "}
            <strong>{mission.receiptCount ?? 0}</strong> (live from mission state /
            trips).
          </p>
        </div>
      ) : (
        <>
          <p className="snippd-muted">
            Upload a ≤60s UGC clip to the <code>ugc-videos</code> Supabase Storage
            bucket.
          </p>
          <input type="file" accept="video/*" onChange={onUpload} />
          {msg ? <p className="snippd-msg">{msg}</p> : null}
        </>
      )}
    </div>
  );
}

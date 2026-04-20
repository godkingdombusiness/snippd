/**
 * Optional edge/webhook that forwards preference decisions to Neo4j.
 * Set VITE_NEO4J_PREFERENCE_URL to your ingest endpoint.
 */
export async function writeUnplannedPreferenceToNeo4j({
  userId,
  saveForNextWeek,
  unplannedItemLabels,
  aiPromptResponse,
}) {
  const url = import.meta.env.VITE_NEO4J_PREFERENCE_URL;
  if (!url) {
    console.warn(
      "[Snippd] VITE_NEO4J_PREFERENCE_URL not set; skipping Neo4j write."
    );
    return { ok: false, skipped: true };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      save_for_next_week: Boolean(saveForNextWeek),
      unplanned_items: unplannedItemLabels,
      ai_prompt_response: aiPromptResponse ?? "",
      source: "receipt_verified",
      recorded_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Neo4j ingest failed: ${res.status} ${text}`);
  }

  return { ok: true };
}

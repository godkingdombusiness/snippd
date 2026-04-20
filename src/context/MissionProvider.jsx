import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadCurrentMission, saveCurrentMission } from "@/lib/missionPersistence";
import { fetchPreferredStores } from "@/lib/profiles";
import { countUserReceipts } from "@/lib/receiptStats";
import { bundleToShoppingList } from "@/lib/missionShoppingList";
import { createInitialMission } from "@/lib/missionDefaults";
import { buildShopTourLinks, STORE_DEFS } from "@/lib/strategyEngine";
import { MissionContext } from "./missionContext";

export function MissionProvider({ children }) {
  const [mission, setMission] = useState(createInitialMission);
  const [userId, setUserId] = useState(null);
  const saveTimer = useRef(null);

  const persist = useCallback(
    async (next) => {
      if (!userId) return;
      await saveCurrentMission(userId, next);
    },
    [userId]
  );

  const scheduleSave = useCallback(
    (next) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        persist(next).catch((e) => console.error("[mission] save failed", e));
      }, 450);
    },
    [persist]
  );

  const patchMission = useCallback(
    (partial) => {
      setMission((prev) => {
        const next = { ...prev, ...partial };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const hydrateFromPayload = useCallback(async (uid, payload) => {
    const prefs = await fetchPreferredStores(uid).catch(() => []);
    const rc = await countUserReceipts(uid).catch(() => 0);
    const base = payload && typeof payload === "object" ? payload : {};
    const merged = {
      ...createInitialMission(),
      ...base,
      preferredStores: prefs.length ? prefs : base.preferredStores ?? [],
      receiptCount: rc,
      missionHydrated: true,
    };
    setMission(merged);
    return merged;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        setUserId(null);
        setMission(createInitialMission());
        return;
      }
      setUserId(session.user.id);
      const payload = await loadCurrentMission(session.user.id).catch(() => null);
      if (cancelled) return;
      await hydrateFromPayload(session.user.id, payload);
    };

    run();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      if (!session?.user) {
        setUserId(null);
        setMission(createInitialMission());
        return;
      }
      setUserId(session.user.id);
      const payload = await loadCurrentMission(session.user.id).catch(() => null);
      await hydrateFromPayload(session.user.id, payload);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrateFromPayload]);

  const lockBundleToMission = useCallback(
    (storeId, strategyKey, strategiesByStore) => {
      const block = strategiesByStore?.[storeId];
      if (!block) return;
      const picked = block[strategyKey];
      if (!picked) return;

      const storeMeta = STORE_DEFS.find((s) => s.id === storeId) ?? STORE_DEFS[0];
      const activeBundle = {
        storeId,
        strategyKey,
        label: `${storeMeta.name} · ${picked.label}`,
        bundle: picked.bundle,
        displayTotalCents: picked.displayTotalCents,
        rawEstimatedCents: picked.rawEstimatedCents,
      };

      const shoppingList = bundleToShoppingList(activeBundle, storeMeta);
      const preShopTourLinks = buildShopTourLinks(storeMeta, picked.bundle);

      setMission((prev) => {
        const next = {
          ...prev,
          activeBundle,
          shoppingList,
          preShopTourLinks,
          preShopTourIndex: 0,
          phase: "clip",
          strategiesByStore,
        };
        if (userId) {
          saveCurrentMission(userId, next).catch((e) =>
            console.error("[mission] lock save failed", e)
          );
        }
        return next;
      });
    },
    [userId]
  );

  const value = useMemo(
    () => ({
      mission,
      userId,
      patchMission,
      setMission,
      persist,
      lockBundleToMission,
    }),
    [mission, userId, patchMission, persist, lockBundleToMission]
  );

  return (
    <MissionContext.Provider value={value}>{children}</MissionContext.Provider>
  );
}

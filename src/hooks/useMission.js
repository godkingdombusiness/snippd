import { useContext } from "react";
import { MissionContext } from "@/context/missionContext";

/** Global mission state: Plan → Clip → Shop → Verify → Studio */
export function useMission() {
  const ctx = useContext(MissionContext);
  if (!ctx) throw new Error("useMission must be used inside MissionProvider");
  return ctx;
}

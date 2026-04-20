import { useLocation, useParams } from "react-router-dom";

export default function ChefMealScreen() {
  const { slot } = useParams();
  const { state } = useLocation();

  return (
    <div className="snippd-screen">
      <h1>AI Chef — Night {slot}</h1>
      <p className="snippd-hero">
        {state?.prompt ??
          "Record my creation: capture prep, plating, and one pro tip in 60 seconds."}
      </p>
      <p className="snippd-muted">
        When you are ready, jump to Studio to upload a 60s UGC clip (unlocks after three
        verified receipts).
      </p>
    </div>
  );
}

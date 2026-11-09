import { createFixtureStore } from "./store";
import { runChangeImpactContract } from "../change-impact-contract";

runChangeImpactContract("fixture store", () => createFixtureStore({ dailyAnalysisLimit: 10_000 }), {
  actor: { userId: "user-alice" },
  numRuns: 200,
});

import { inngest } from "../events";
import { runAutomationsForAllAgencies } from "./jobs";

/**
 * Runs the automatic jobs every 15 minutes once Inngest is connected. Vercel
 * Cron calls the same jobs through /api/cron/automations; running both is
 * harmless because each reminder, follow-up and nudge happens once.
 */
export const automationsCron = inngest.createFunction(
  { id: "automations-tick", triggers: { cron: "TZ=Europe/Brussels */15 * * * *" } },
  async ({ step }) => step.run("run-automations", () => runAutomationsForAllAgencies()),
);

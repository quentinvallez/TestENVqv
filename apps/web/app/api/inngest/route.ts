import { automationsCron, inngest } from "@viewing/core";
import { serve } from "inngest/next";

// Agent workflows and scheduled jobs register here as they are built.
export const { GET, POST, PUT } = serve({ client: inngest, functions: [automationsCron] });

import { inngest } from "@viewing/core";
import { serve } from "inngest/next";

// Agent workflows register here as they are built (planner, reminders, ...).
export const { GET, POST, PUT } = serve({ client: inngest, functions: [] });

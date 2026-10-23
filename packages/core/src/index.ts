import { listAgents } from "./tools/agents";
import { dashboardSummary, recentActivity } from "./tools/activity";
import { listAppointments } from "./tools/appointments";
import { listContacts } from "./tools/contacts";
import { seedDemoData } from "./tools/demo";
import { leadStages, listLeads, moveLeadStage } from "./tools/leads";
import { createListing, getListing, listListings } from "./tools/listings";
import { listConversations } from "./tools/conversations";
import { decideProposal, listProposals } from "./tools/proposals";

export * from "./tool";
export * from "./time";
export { inngest, recordEvent } from "./events";
export { leadStages };

/** The registry of every action in the product. */
export const tools = {
  listListings,
  getListing,
  createListing,
  listLeads,
  moveLeadStage,
  listContacts,
  listAppointments,
  listAgents,
  listProposals,
  decideProposal,
  listConversations,
  recentActivity,
  dashboardSummary,
  seedDemoData,
};

import { listAgents } from "./tools/agents";
import { dashboardSummary, recentActivity } from "./tools/activity";
import { listAppointments } from "./tools/appointments";
import { getContact, listContacts } from "./tools/contacts";
import { seedDemoData } from "./tools/demo";
import { listLeads, moveLeadStage } from "./tools/leads";
import { createListing, getListing, listListings } from "./tools/listings";
import { getConversation, listInbox, plannerFollowUp, plannerRedraft, receiveMessage, replyToConversation, updateConversation } from "./tools/conversations";
import { decideProposal, listProposals } from "./tools/proposals";
import { availableSlots, bookViewing, cancelAppointment, getAgentAvailability, rescheduleAppointment, setAgentAvailability } from "./tools/booking";
import type { Tool } from "./tool";

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
  listInbox,
  getConversation,
  replyToConversation,
  updateConversation,
  receiveMessage,
  plannerRedraft,
  plannerFollowUp,
  getContact,
  recentActivity,
  dashboardSummary,
  availableSlots,
  bookViewing,
  cancelAppointment,
  rescheduleAppointment,
  getAgentAvailability,
  setAgentAvailability,
  seedDemoData,
};

/** Tools by their public name, as agents and proposals refer to them. */
export const toolsByName: Record<string, Tool> = Object.fromEntries(Object.values(tools).map((tool) => [tool.name, tool as Tool]));

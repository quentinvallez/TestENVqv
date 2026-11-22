import { createAgent, listAgents, updateAgent } from "./tools/agents";
import { portalLeadsStatus, removePortalForwarding, setLeadCopyAddress, setupPortalForwarding } from "./tools/portal-forwarding";
import { renewMailboxLeads, startMailboxLeads, stopMailboxLeads, syncMailboxLeads } from "./tools/mailbox-leads";
import { dashboardSummary, recentActivity } from "./tools/activity";
import { listAppointments } from "./tools/appointments";
import { getContact, listContacts } from "./tools/contacts";
import { resetToDemoData, seedDemoData } from "./tools/demo";
import { listLeads, moveLeadStage } from "./tools/leads";
import { getRequest, listRequests, markRequest, requestConversationIds } from "./tools/requests";
import { assignListingAgent, createListing, getListing, listingBookingLink, listListings } from "./tools/listings";
import { getConversation, listInbox, plannerFollowUp, plannerRedraft, receiveMessage, replyToConversation, updateConversation } from "./tools/conversations";
import { decideProposal, listProposals } from "./tools/proposals";
import { availableSlots, bookValuationVisit, bookViewing, cancelAppointment, getAgentAvailability, rescheduleAppointment, setAgentAvailability } from "./tools/booking";
import { getValuation, listValuations, requestValuation, verifyValuation } from "./tools/valuations";
import { findMatchingClients, recommendForContact, similarListings, suggestListings, suggestListingToMatches } from "./tools/recommendations";
import { bookingQuestionsForWidget, getBookingQuestions, updateBookingQuestions } from "./tools/booking-questions";
import { getWidgetSettings, noteWidgetSeen, readWebsiteLook, updateBrandColour, updateWidgetSettings } from "./tools/settings";
import { channelsStatus, checkWhatsApp, connectCalendar, connectWhatsApp, disconnectCalendar, listAgentsWithoutMailbox, listConnections, listUndeliveredMessages, markEmailBounced, receiveEmail, receivePortalLead, receiveWhatsApp } from "./tools/channels";
import { getAutomationSettings, listAutomationRuns, markAttendance, runAutomationsNow, updateAutomationSettings } from "./tools/automations";
import { createWidgetPreview, deleteWidgetPreview, listWidgetPreviews, noteWidgetPreview } from "./tools/previews";
import { importWebsiteListings, importWebsitePage, websiteImportStatus } from "./tools/website";
import { cancelOpenHouse, listOpenHouses, planOpenHouse } from "./tools/open-houses";
import { addListingOccupant, getOccupantPage, listListingOccupants, reportOccupantProblem, requestViewing, setListingAccess, setOccupantAvailability, updateListingOccupant } from "./tools/occupants";
import type { Tool } from "./tool";

/** The registry of every action in the product. */
import { eraseContact, exportContact, previewRetention } from "./tools/privacy";
import { getAgentLogin, getMyAgent, linkAgentLogin, listTeamNotConnected, sendInvitationEmail, sendPasswordReset, unlinkAgentLogin } from "./tools/team";
export const tools = {
  listListings,
  getWidgetSettings,
  updateWidgetSettings,
  updateBrandColour,
  getBookingQuestions,
  bookingQuestionsForWidget,
  updateBookingQuestions,
  noteWidgetSeen,
  readWebsiteLook,
  getListing,
  listingBookingLink,
  createListing,
  assignListingAgent,
  listLeads,
  listRequests,
  getRequest,
  markRequest,
  requestConversationIds,
  moveLeadStage,
  listContacts,
  listAppointments,
  listAgents,
  createAgent,
  updateAgent,
  portalLeadsStatus,
  setupPortalForwarding,
  removePortalForwarding,
  startMailboxLeads,
  stopMailboxLeads,
  syncMailboxLeads,
  renewMailboxLeads,
  setLeadCopyAddress,
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
  listTeamNotConnected,
  availableSlots,
  bookViewing,
  planOpenHouse,
  listOpenHouses,
  cancelOpenHouse,
  cancelAppointment,
  rescheduleAppointment,
  getAgentAvailability,
  setAgentAvailability,
  requestValuation,
  verifyValuation,
  getValuation,
  listValuations,
  bookValuationVisit,
  similarListings,
  recommendForContact,
  suggestListings,
  findMatchingClients,
  suggestListingToMatches,
  getAutomationSettings,
  setListingAccess,
  listListingOccupants,
  addListingOccupant,
  updateListingOccupant,
  getOccupantPage,
  setOccupantAvailability,
  reportOccupantProblem,
  requestViewing,
  updateAutomationSettings,
  runAutomationsNow,
  listAutomationRuns,
  markAttendance,
  seedDemoData,
  resetToDemoData,
  receivePortalLead,
  receiveEmail,
  receiveWhatsApp,
  markEmailBounced,
  listUndeliveredMessages,
  listConnections,
  connectCalendar,
  disconnectCalendar,
  channelsStatus,
  listAgentsWithoutMailbox,
  getAgentLogin,
  exportContact,
  eraseContact,
  previewRetention,
  getMyAgent,
  sendPasswordReset,
  sendInvitationEmail,
  linkAgentLogin,
  unlinkAgentLogin,
  connectWhatsApp,
  checkWhatsApp,
  importWebsiteListings,
  importWebsitePage,
  websiteImportStatus,
  createWidgetPreview,
  listWidgetPreviews,
  noteWidgetPreview,
  deleteWidgetPreview,
};

/** Tools by their public name, as agents and proposals refer to them. */
export const toolsByName: Record<string, Tool> = Object.fromEntries(Object.values(tools).map((tool) => [tool.name, tool as Tool]));

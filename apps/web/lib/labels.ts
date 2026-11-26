import { msg } from "@/lib/i18n";
export const leadStageMeta = {
  new: { label: msg("New"), color: "#3b82f6" },
  invited: { label: msg("Invited"), color: "#8b5cf6" },
  booked: { label: msg("Booked"), color: "#f59e0b" },
  visited: { label: msg("Visited"), color: "#06b6d4" },
  follow_up: { label: msg("Follow-up"), color: "#ec4899" },
  offer: { label: msg("Offer"), color: "#16a34a" },
  won: { label: msg("Won"), color: "#15803d" },
  lost: { label: msg("Lost"), color: "#a1a1aa" },
} as const;

/** The requests board's stages, in the order a request moves through them. */
export const requestStageMeta = {
  contacted: { label: msg("Contacted"), color: "#3b82f6", hint: msg("Got the booking link automatically") },
  not_planned: { label: msg("Not planned yet"), color: "#f59e0b", hint: msg("No booking yet: reminders after 24 and 72 hours") },
  planned: { label: msg("Planned"), color: "#16a34a", hint: msg("Viewing booked") },
  visited: { label: msg("Visited"), color: "#06b6d4", hint: msg("The viewing took place") },
  closed: { label: msg("Closed"), color: "#a1a1aa", hint: msg("No response, not interested or done") },
} as const;

export const requestReasonLabel: Record<string, string> = {
  draft: msg("Waits for your OK"),
  not_delivered: msg("Our message didn't arrive"),
  no_response: msg("No response after two reminders"),
  not_interested: msg("Not interested"),
  won: msg("Deal done"),
};

export const listingStatusMeta = {
  draft: { label: msg("Draft"), color: "#a1a1aa" },
  active: { label: msg("Active"), color: "#16a34a" },
  under_offer: { label: msg("Under option"), color: "#f59e0b" },
  sold: { label: msg("Sold"), color: "#6366f1" },
  rented: { label: msg("Rented"), color: "#6366f1" },
  archived: { label: msg("Archived"), color: "#d4d4d8" },
} as const;

export const appointmentStatusMeta = {
  scheduled: { label: msg("Scheduled"), color: "#f59e0b" },
  confirmed: { label: msg("Confirmed"), color: "#16a34a" },
  completed: { label: msg("Completed"), color: "#a1a1aa" },
  cancelled: { label: msg("Cancelled"), color: "#dc2626" },
  no_show: { label: msg("No-show"), color: "#dc2626" },
} as const;

export const sourceLabel: Record<string, string> = {
  immoweb: "Immoweb",
  zimmo: "Zimmo",
  immovlan: "Immovlan",
  immoscoop: "Immoscoop",
  website: msg("Website"),
  whatsapp: "WhatsApp",
  phone: msg("Phone"),
  manual: msg("Manual"),
  valuation: msg("Valuation"),
};

export const propertyTypeLabel: Record<string, string> = {
  apartment: msg("Apartment"),
  house: msg("House"),
  villa: msg("Villa"),
  land: msg("Land"),
  commercial: msg("Commercial"),
};

export const eventLabel: Record<string, string> = {
  "lead.created": msg("New lead"),
  "lead.stage_changed": msg("Lead moved"),
  "appointment.booked": msg("Viewing booked"),
  "appointment.cancelled": msg("Viewing cancelled"),
  "appointment.rescheduled": msg("Viewing moved"),
  "agent.availability_changed": msg("Working hours changed"),
  "proposal.approved": msg("Proposal approved"),
  "proposal.rejected": msg("Proposal dismissed"),
  "message.sent": msg("Reply sent"),
  "listing.agent_changed": msg("Responsible agent changed"),
  "valuation.requested": msg("Valuation started"),
  "planner.recommended": msg("Planner suggested properties"),
  "valuation.completed": msg("Valuation completed"),
  "appointment.booked_by_client": msg("Booked on the website"),
  "planner.drafted": msg("Planner drafted a reply"),
  "planner.follow_up_drafted": msg("Planner drafted a follow-up"),
  "conversation.status_changed": msg("Conversation updated"),
  "listing.created": msg("Listing created"),
  "message.received": msg("Message received"),
  "appointment.completed": msg("Viewing done"),
  "appointment.no_show": msg("Client didn't show up"),
  "automation.reminder_sent": msg("Reminder sent"),
  "automation.reminder_drafted": msg("Reminder drafted"),
  "automation.follow_up_drafted": msg("Follow-up drafted"),
  "automation.nudge_drafted": msg("Check-in drafted"),
  "planner.off_market_drafted": msg("Planner drafted a cancellation (listing off the market)"),
  "planner.occupant_conflict_drafted": msg("Planner drafted a request to move (occupants unavailable)"),
  "listing.access_changed": msg("Viewing access changed"),
  "listing.occupant_added": msg("Owner or tenant added"),
  "listing.occupant_updated": msg("Owner or tenant updated"),
  "listing.availability_changed": msg("Occupants changed their visiting times"),
  "listing.occupant_problem": msg("Occupants can't receive a viewing"),
  "listing.occupants_alerted": msg("Occupants alerted"),
  "lead.viewing_requested": msg("Asked for a viewing"),
  "settings.automations_updated": msg("Automations changed"),
};

/** What the automatic jobs did, for the settings page. */
export const automationRuleLabel: Record<string, string> = {
  reminder: msg("Reminder"),
  follow_up: msg("Follow-up"),
  no_show: msg("No-show message"),
  nudge: msg("Check-in"),
  occupant_digest: msg("Owner: tomorrow's viewings"),
  occupant_nudge: msg("Owner: reminder to give visiting times"),
};

export const categoryMeta: Record<string, { label: string; color: string }> = {
  valuation: { label: msg("Seller lead"), color: "#0e7490" },
  booking: { label: msg("New booking"), color: "#16a34a" },
  viewing_request: { label: msg("Viewing request"), color: "#3b82f6" },
  reschedule: { label: msg("Reschedule"), color: "#f59e0b" },
  cancellation: { label: msg("Cancellation"), color: "#dc2626" },
  question: { label: msg("Question"), color: "#06b6d4" },
  offer: { label: msg("Offer"), color: "#16a34a" },
  feedback: { label: msg("Feedback"), color: "#ec4899" },
  confirmation: { label: msg("Confirmation"), color: "#a1a1aa" },
  other: { label: msg("Other"), color: "#a1a1aa" },
};

export const temperatureMeta = {
  hot: { label: msg("Hot lead"), color: "#dc2626" },
  warm: { label: msg("Warm lead"), color: "#f59e0b" },
  cold: { label: msg("Cold lead"), color: "#60a5fa" },
} as const;

export const reasonLabel: Record<string, string> = {
  type: msg("same type"),
  price: msg("similar price"),
  size: msg("similar size"),
  bedrooms: msg("same bedrooms"),
  area: msg("same area"),
};

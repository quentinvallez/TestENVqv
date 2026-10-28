export const leadStageMeta = {
  new: { label: "New", color: "#3b82f6" },
  invited: { label: "Invited", color: "#8b5cf6" },
  booked: { label: "Booked", color: "#f59e0b" },
  visited: { label: "Visited", color: "#06b6d4" },
  follow_up: { label: "Follow-up", color: "#ec4899" },
  offer: { label: "Offer", color: "#16a34a" },
  won: { label: "Won", color: "#15803d" },
  lost: { label: "Lost", color: "#a1a1aa" },
} as const;

export const listingStatusMeta = {
  draft: { label: "Draft", color: "#a1a1aa" },
  active: { label: "Active", color: "#16a34a" },
  under_offer: { label: "Under option", color: "#f59e0b" },
  sold: { label: "Sold", color: "#6366f1" },
  rented: { label: "Rented", color: "#6366f1" },
  archived: { label: "Archived", color: "#d4d4d8" },
} as const;

export const appointmentStatusMeta = {
  scheduled: { label: "Scheduled", color: "#f59e0b" },
  confirmed: { label: "Confirmed", color: "#16a34a" },
  completed: { label: "Completed", color: "#a1a1aa" },
  cancelled: { label: "Cancelled", color: "#dc2626" },
  no_show: { label: "No-show", color: "#dc2626" },
} as const;

export const sourceLabel: Record<string, string> = {
  immoweb: "Immoweb",
  zimmo: "Zimmo",
  immovlan: "Immovlan",
  website: "Website",
  whatsapp: "WhatsApp",
  phone: "Phone",
  manual: "Manual",
  valuation: "Valuation",
};

export const propertyTypeLabel: Record<string, string> = {
  apartment: "Apartment",
  house: "House",
  villa: "Villa",
  land: "Land",
  commercial: "Commercial",
};

export const eventLabel: Record<string, string> = {
  "lead.created": "New lead",
  "lead.stage_changed": "Lead moved",
  "appointment.booked": "Viewing booked",
  "appointment.cancelled": "Viewing cancelled",
  "appointment.rescheduled": "Viewing moved",
  "agent.availability_changed": "Working hours changed",
  "proposal.approved": "Proposal approved",
  "proposal.rejected": "Proposal dismissed",
  "message.sent": "Reply sent",
  "listing.agent_changed": "Responsible agent changed",
  "valuation.requested": "Valuation started",
  "planner.recommended": "Planner suggested properties",
  "valuation.completed": "Valuation completed",
  "appointment.booked_by_client": "Booked on the website",
  "planner.drafted": "Planner drafted a reply",
  "planner.follow_up_drafted": "Planner drafted a follow-up",
  "conversation.status_changed": "Conversation updated",
  "listing.created": "Listing created",
  "message.received": "Message received",
  "appointment.completed": "Viewing done",
  "appointment.no_show": "Client didn't show up",
  "automation.reminder_sent": "Reminder sent",
  "automation.reminder_drafted": "Reminder drafted",
  "automation.follow_up_drafted": "Follow-up drafted",
  "automation.nudge_drafted": "Check-in drafted",
  "planner.off_market_drafted": "Planner drafted a cancellation (listing off the market)",
  "planner.occupant_conflict_drafted": "Planner drafted a request to move (occupants unavailable)",
  "listing.access_changed": "Viewing access changed",
  "listing.occupant_added": "Owner or tenant added",
  "listing.occupant_updated": "Owner or tenant updated",
  "listing.availability_changed": "Occupants changed their visiting times",
  "listing.occupant_problem": "Occupants can't receive a viewing",
  "listing.occupants_alerted": "Occupants alerted",
  "lead.viewing_requested": "Asked for a viewing",
  "settings.automations_updated": "Automations changed",
};

/** What the automatic jobs did, for the settings page. */
export const automationRuleLabel: Record<string, string> = {
  reminder: "Reminder",
  follow_up: "Follow-up",
  no_show: "No-show message",
  nudge: "Check-in",
  occupant_digest: "Owner: tomorrow's viewings",
  occupant_nudge: "Owner: reminder to give visiting times",
};

export const categoryMeta: Record<string, { label: string; color: string }> = {
  valuation: { label: "Seller lead", color: "#0e7490" },
  booking: { label: "New booking", color: "#16a34a" },
  viewing_request: { label: "Viewing request", color: "#3b82f6" },
  reschedule: { label: "Reschedule", color: "#f59e0b" },
  cancellation: { label: "Cancellation", color: "#dc2626" },
  question: { label: "Question", color: "#06b6d4" },
  offer: { label: "Offer", color: "#16a34a" },
  feedback: { label: "Feedback", color: "#ec4899" },
  confirmation: { label: "Confirmation", color: "#a1a1aa" },
  other: { label: "Other", color: "#a1a1aa" },
};

export const temperatureMeta = {
  hot: { label: "Hot lead", color: "#dc2626" },
  warm: { label: "Warm lead", color: "#f59e0b" },
  cold: { label: "Cold lead", color: "#60a5fa" },
} as const;

export const reasonLabel: Record<string, string> = {
  type: "same type",
  price: "similar price",
  size: "similar size",
  bedrooms: "same bedrooms",
  area: "same area",
};

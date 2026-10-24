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
  under_offer: { label: "Under offer", color: "#f59e0b" },
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
  "planner.drafted": "Planner drafted a reply",
  "planner.follow_up_drafted": "Planner drafted a follow-up",
  "conversation.status_changed": "Conversation updated",
  "listing.created": "Listing created",
  "message.received": "Message received",
};

export const categoryMeta: Record<string, { label: string; color: string }> = {
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

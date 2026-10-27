import { relations } from "drizzle-orm";
import { agents, appointments, contacts, conversations, leads, listingOccupants, listings, messages, offices, proposals, valuations } from "./domain";

export const officeRelations = relations(offices, ({ many }) => ({
  agents: many(agents),
  listings: many(listings),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
  office: one(offices, { fields: [agents.officeId], references: [offices.id] }),
  listings: many(listings),
  appointments: many(appointments),
}));

export const listingRelations = relations(listings, ({ one, many }) => ({
  office: one(offices, { fields: [listings.officeId], references: [offices.id] }),
  agent: one(agents, { fields: [listings.agentId], references: [agents.id] }),
  leads: many(leads),
  appointments: many(appointments),
  occupants: many(listingOccupants),
}));

export const listingOccupantRelations = relations(listingOccupants, ({ one }) => ({
  listing: one(listings, { fields: [listingOccupants.listingId], references: [listings.id] }),
  contact: one(contacts, { fields: [listingOccupants.contactId], references: [contacts.id] }),
}));

export const contactRelations = relations(contacts, ({ many }) => ({
  leads: many(leads),
  appointments: many(appointments),
  conversations: many(conversations),
}));

export const leadRelations = relations(leads, ({ one, many }) => ({
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  listing: one(listings, { fields: [leads.listingId], references: [listings.id] }),
  agent: one(agents, { fields: [leads.agentId], references: [agents.id] }),
  appointments: many(appointments),
}));

export const appointmentRelations = relations(appointments, ({ one }) => ({
  agent: one(agents, { fields: [appointments.agentId], references: [agents.id] }),
  listing: one(listings, { fields: [appointments.listingId], references: [listings.id] }),
  contact: one(contacts, { fields: [appointments.contactId], references: [contacts.id] }),
  lead: one(leads, { fields: [appointments.leadId], references: [leads.id] }),
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
  listing: one(listings, { fields: [conversations.listingId], references: [listings.id] }),
  messages: many(messages),
  proposals: many(proposals),
}));

export const proposalRelations = relations(proposals, ({ one }) => ({
  conversation: one(conversations, { fields: [proposals.conversationId], references: [conversations.id] }),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const valuationRelations = relations(valuations, ({ one }) => ({
  contact: one(contacts, { fields: [valuations.contactId], references: [contacts.id] }),
  lead: one(leads, { fields: [valuations.leadId], references: [leads.id] }),
  agent: one(agents, { fields: [valuations.agentId], references: [agents.id] }),
}));

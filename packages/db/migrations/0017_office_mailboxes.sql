ALTER TABLE "calendar_connections" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
-- An earlier preview of this change created the index on agency_id alone (one office mailbox per agency) on the shared database.
DROP INDEX IF EXISTS "calendar_connections_office_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_office_idx" ON "calendar_connections" USING btree ("agency_id","account_email") WHERE "calendar_connections"."agent_id" is null;

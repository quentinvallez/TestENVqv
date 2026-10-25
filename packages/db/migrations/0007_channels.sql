ALTER TABLE "agency_settings" ADD COLUMN "channels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "scopes" jsonb DEFAULT '["calendar"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_agent_id_provider_index" ON "calendar_connections" USING btree ("agent_id","provider");--> statement-breakpoint
CREATE INDEX "messages_agency_id_external_id_index" ON "messages" USING btree ("agency_id","external_id");
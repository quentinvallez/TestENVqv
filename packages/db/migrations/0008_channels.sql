-- Written to run safely more than once: the preview database of this branch already
-- applied an earlier draft of this migration (then numbered 0007) before
-- 0007_automations existed, so drizzle skips 0007_automations there. Repeating its
-- statements here with IF NOT EXISTS fixes that database and is a no-op elsewhere.
CREATE TABLE IF NOT EXISTS "automation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"rule" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"due_key" text NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"proposal_id" text,
	"message_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_settings" ADD COLUMN IF NOT EXISTS "automations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "automation_runs_agency_id_rule_subject_id_due_key_index" ON "automation_runs" USING btree ("agency_id","rule","subject_id","due_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_runs_agency_id_created_at_index" ON "automation_runs" USING btree ("agency_id","created_at");--> statement-breakpoint
ALTER TABLE "agency_settings" ADD COLUMN IF NOT EXISTS "channels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "scopes" jsonb DEFAULT '["calendar"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_connections_agent_id_provider_index" ON "calendar_connections" USING btree ("agent_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_agency_id_external_id_index" ON "messages" USING btree ("agency_id","external_id");

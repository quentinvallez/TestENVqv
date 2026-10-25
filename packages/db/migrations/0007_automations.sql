CREATE TABLE "automation_runs" (
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
ALTER TABLE "agency_settings" ADD COLUMN "automations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_agency_id_rule_subject_id_due_key_index" ON "automation_runs" USING btree ("agency_id","rule","subject_id","due_key");--> statement-breakpoint
CREATE INDEX "automation_runs_agency_id_created_at_index" ON "automation_runs" USING btree ("agency_id","created_at");
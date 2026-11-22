CREATE TABLE "signup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"agency_name" text NOT NULL,
	"website" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"note" text,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"created_agency_id" text,
	"completed_at" timestamp with time zone,
	"dpa_version" text,
	"dpa_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_requests_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_created_agency_id_organization_id_fk" FOREIGN KEY ("created_agency_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signup_requests_agency_id_status_created_at_index" ON "signup_requests" USING btree ("agency_id","status","created_at");--> statement-breakpoint
CREATE INDEX "signup_requests_email_idx" ON "signup_requests" USING btree (lower("email"));
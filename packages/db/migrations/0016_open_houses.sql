CREATE TABLE "open_houses" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"slot_minutes" smallint DEFAULT 15 NOT NULL,
	"per_slot" smallint DEFAULT 4 NOT NULL,
	"exclusive" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"note" text,
	"external_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "open_house_id" text;--> statement-breakpoint
ALTER TABLE "open_houses" ADD CONSTRAINT "open_houses_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_houses" ADD CONSTRAINT "open_houses_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_houses" ADD CONSTRAINT "open_houses_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_houses_listing_id_starts_at_index" ON "open_houses" USING btree ("listing_id","starts_at");--> statement-breakpoint
CREATE INDEX "open_houses_agent_id_starts_at_index" ON "open_houses" USING btree ("agent_id","starts_at");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_open_house_id_open_houses_id_fk" FOREIGN KEY ("open_house_id") REFERENCES "public"."open_houses"("id") ON DELETE set null ON UPDATE no action;
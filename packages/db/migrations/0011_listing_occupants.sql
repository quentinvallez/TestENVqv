CREATE TABLE "listing_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "listing_occupants" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"alerts" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_occupants_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "listing_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "access" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "viewing_notice_hours" smallint;--> statement-breakpoint
ALTER TABLE "listing_blocks" ADD CONSTRAINT "listing_blocks_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_blocks" ADD CONSTRAINT "listing_blocks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_occupants" ADD CONSTRAINT "listing_occupants_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_occupants" ADD CONSTRAINT "listing_occupants_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_occupants" ADD CONSTRAINT "listing_occupants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_windows" ADD CONSTRAINT "listing_windows_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_windows" ADD CONSTRAINT "listing_windows_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_blocks_listing_id_starts_at_index" ON "listing_blocks" USING btree ("listing_id","starts_at");--> statement-breakpoint
CREATE INDEX "listing_occupants_agency_id_listing_id_index" ON "listing_occupants" USING btree ("agency_id","listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_occupants_listing_id_contact_id_index" ON "listing_occupants" USING btree ("listing_id","contact_id");--> statement-breakpoint
CREATE INDEX "listing_windows_listing_id_index" ON "listing_windows" USING btree ("listing_id");
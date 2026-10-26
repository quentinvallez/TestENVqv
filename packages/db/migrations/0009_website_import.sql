CREATE TABLE "website_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'pending' NOT NULL,
	"listing_id" text,
	"content_hash" text,
	"extracted_by" text,
	"agent_name" text,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_settings" ADD COLUMN "website_sync" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "website_pages_agency_id_url_index" ON "website_pages" USING btree ("agency_id","url");--> statement-breakpoint
CREATE INDEX "website_pages_listing_id_index" ON "website_pages" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "website_pages_agency_id_kind_index" ON "website_pages" USING btree ("agency_id","kind");
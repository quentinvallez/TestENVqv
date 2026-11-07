CREATE TABLE "widget_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"token" text NOT NULL,
	"site" text NOT NULL,
	"name" text,
	"brand_color" text,
	"language" text DEFAULT 'nl' NOT NULL,
	"home_framable" boolean DEFAULT false NOT NULL,
	"listing_framable" boolean DEFAULT false NOT NULL,
	"listings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"home_shot" text,
	"listing_shot" text,
	"home_shot_phone" text,
	"listing_shot_phone" text,
	"source" text DEFAULT 'back_office' NOT NULL,
	"email" text,
	"views" integer DEFAULT 0 NOT NULL,
	"demo_bookings" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_previews_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "widget_previews" ADD CONSTRAINT "widget_previews_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "widget_previews_agency_id_created_at_index" ON "widget_previews" USING btree ("agency_id","created_at");
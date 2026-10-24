CREATE TABLE "valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"contact_id" text,
	"lead_id" text,
	"agent_id" text,
	"token" text NOT NULL,
	"street" text NOT NULL,
	"house_number" text,
	"postcode" text NOT NULL,
	"city" text NOT NULL,
	"answers" jsonb NOT NULL,
	"first_name" text,
	"email" text,
	"phone" text NOT NULL,
	"language" text DEFAULT 'nl' NOT NULL,
	"verification_code" text NOT NULL,
	"verification_method" text,
	"verified_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valuations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "market_prices" (
	"nis_code" text NOT NULL,
	"municipality" text NOT NULL,
	"region" text,
	"property_type" text NOT NULL,
	"year" smallint NOT NULL,
	"transactions" integer NOT NULL,
	"p25" integer,
	"median" integer NOT NULL,
	"p75" integer,
	"source" text DEFAULT 'statbel' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_prices_nis_code_property_type_year_pk" PRIMARY KEY("nis_code","property_type","year")
);
--> statement-breakpoint
CREATE TABLE "postcodes" (
	"postcode" text NOT NULL,
	"locality" text NOT NULL,
	"nis_code" text,
	"municipality" text,
	"province" text,
	"region" text,
	CONSTRAINT "postcodes_postcode_locality_pk" PRIMARY KEY("postcode","locality")
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "intent" text DEFAULT 'buy' NOT NULL;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "valuations_agency_id_created_at_index" ON "valuations" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "postcodes_nis_code_index" ON "postcodes" USING btree ("nis_code");
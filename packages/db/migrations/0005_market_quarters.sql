ALTER TABLE "market_prices" ADD COLUMN "municipality_nl" text;--> statement-breakpoint
ALTER TABLE "market_prices" ADD COLUMN "quarter" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_prices" ALTER COLUMN "median" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "market_prices" DROP CONSTRAINT "market_prices_nis_code_property_type_year_pk";--> statement-breakpoint
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_nis_code_property_type_year_quarter_pk" PRIMARY KEY("nis_code","property_type","year","quarter");

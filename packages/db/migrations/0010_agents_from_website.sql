ALTER TABLE "agents" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "source" text;
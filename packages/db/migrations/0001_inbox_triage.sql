ALTER TABLE "conversations" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "listing_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "unread" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qualification" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_type" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "generated_by" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
CREATE TYPE "public"."agent_kind" AS ENUM('BUYER_AGENT', 'MERCHANT_AGENT', 'ARBITER');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('VALIDATED', 'HANDSHAKING', 'NEGOTIATING', 'AGREED', 'PAYING', 'RECEIPTED', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'RULED');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_status" AS ENUM('RESERVED', 'SETTLED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('HANDSHAKE', 'NEGOTIATION', 'TRANSCRIPT');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "agent_kind" NOT NULL,
	"display_name" text NOT NULL,
	"public_key" jsonb NOT NULL,
	"attestation" jsonb NOT NULL,
	"private_key_pkcs8" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"mandate_id" text NOT NULL,
	"buyer_agent_id" text NOT NULL,
	"merchant_agent_id" text NOT NULL,
	"status" "deal_status" NOT NULL,
	"session_id" text,
	"agreed_offer" jsonb,
	"policy" jsonb,
	"payment" jsonb,
	"fulfillment" jsonb,
	"injection_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"claim_type" text NOT NULL,
	"claim" text NOT NULL,
	"opened_by" text NOT NULL,
	"status" "dispute_status" NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ruling" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ruled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"mandate_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"status" "ledger_entry_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" jsonb NOT NULL,
	"agent_id" text NOT NULL,
	"currency" text NOT NULL,
	"max_total" integer NOT NULL,
	"per_item_max" integer NOT NULL,
	"allowed_categories" jsonb NOT NULL,
	"forbidden_substitutions" jsonb NOT NULL,
	"merchant_allowlist" jsonb,
	"max_transactions" integer NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"nonce" text NOT NULL,
	"signature" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"kind" "message_kind" NOT NULL,
	"seq" integer NOT NULL,
	"signer" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"payload_hash" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"digest" text NOT NULL,
	"buyer_signature" jsonb NOT NULL,
	"merchant_signature" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trust_scores" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"score" integer NOT NULL,
	"grade" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_agent_id_agents_id_fk" FOREIGN KEY ("buyer_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_merchant_agent_id_agents_id_fk" FOREIGN KEY ("merchant_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_kind_idx" ON "agents" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "deals_mandate_idx" ON "deals" USING btree ("mandate_id");--> statement-breakpoint
CREATE INDEX "deals_merchant_idx" ON "deals" USING btree ("merchant_agent_id");--> statement-breakpoint
CREATE INDEX "disputes_deal_idx" ON "disputes" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_mandate_idx" ON "ledger_entries" USING btree ("mandate_id");--> statement-breakpoint
CREATE INDEX "ledger_deal_idx" ON "ledger_entries" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "mandates_agent_idx" ON "mandates" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mandates_nonce_idx" ON "mandates" USING btree ("nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_deal_kind_seq_idx" ON "messages" USING btree ("deal_id","kind","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_deal_idx" ON "receipts" USING btree ("deal_id");
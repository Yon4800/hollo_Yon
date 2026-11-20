CREATE TABLE "domain_blocks" (
	"domain" text PRIMARY KEY,
	"reason" text,
	"created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;
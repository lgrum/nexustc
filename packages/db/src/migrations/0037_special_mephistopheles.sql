CREATE TABLE "patreon_webhook_request" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"event" text,
	"headers" jsonb NOT NULL,
	"method" text NOT NULL,
	"processing_error" text,
	"processing_status" text DEFAULT 'stored' NOT NULL,
	"processed_at" timestamp with time zone,
	"response_status" integer,
	"signature" text,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "patreon_webhook_request_created_at_idx" ON "patreon_webhook_request" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "patreon_webhook_request_event_idx" ON "patreon_webhook_request" USING btree ("event");--> statement-breakpoint
CREATE INDEX "patreon_webhook_request_status_idx" ON "patreon_webhook_request" USING btree ("processing_status");
ALTER TABLE "xp_event" DROP CONSTRAINT "xp_event_amount_check";--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_amount_check" CHECK ("xp_event"."amount" <> 0 or ("xp_event"."kind" = 'reversal' and "xp_event"."reverses_event_id" is not null and "xp_event"."state" = 'posted') or ("xp_event"."state" = 'posted' and "xp_event"."metadata"->>'completionLedger' = 'true'));

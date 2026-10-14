CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`device_id` text,
	CONSTRAINT "sync_state_single_row" CHECK("sync_state"."id" = 1)
);

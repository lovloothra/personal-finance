CREATE TABLE `review_undo_journal` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_undo_journal_consumed_idx` ON `review_undo_journal` (`consumed_at`);
CREATE TABLE `duplicate_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`keeper_transaction_id` text NOT NULL,
	`candidate_transaction_id` text NOT NULL,
	`basis` text DEFAULT 'signature_token_prefix' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duplicate_candidates_candidate_idx` ON `duplicate_candidates` (`candidate_transaction_id`);--> statement-breakpoint
CREATE INDEX `duplicate_candidates_status_idx` ON `duplicate_candidates` (`status`);
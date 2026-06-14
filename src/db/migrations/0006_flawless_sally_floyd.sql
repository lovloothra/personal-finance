PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text,
	`message_id` text,
	`institution_id` text,
	`txn_date` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`raw_description` text,
	`merchant` text,
	`flow` text,
	`category` text,
	`subcategory` text,
	`confidence` text,
	`classification_reason` text,
	`profile_signal_used` text,
	`layer` integer,
	`classification_source` text DEFAULT 'deterministic' NOT NULL,
	`accepted_prediction_id` text,
	`review_required` integer DEFAULT false,
	`is_internal_transfer` integer DEFAULT false,
	`is_recurring` integer DEFAULT false,
	`project_id` text,
	`tax_section` text,
	`own_account_id` text,
	`own_account_kind` text,
	`counterparty_raw` text,
	`counterparty_id` text,
	`counterparty_kind` text,
	`suspected_transfer` integer DEFAULT false,
	`fy_key` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `parsed_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `gmail_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `profile_one_time_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "document_id", "message_id", "institution_id", "txn_date", "amount", "currency", "raw_description", "merchant", "flow", "category", "subcategory", "confidence", "classification_reason", "profile_signal_used", "layer", "classification_source", "accepted_prediction_id", "review_required", "is_internal_transfer", "is_recurring", "project_id", "tax_section", "own_account_id", "own_account_kind", "counterparty_raw", "counterparty_id", "counterparty_kind", "suspected_transfer", "fy_key", "created_at", "updated_at") SELECT "id", "document_id", "message_id", "institution_id", "txn_date", "amount", "currency", "raw_description", "merchant", "flow", "category", "subcategory", "confidence", "classification_reason", "profile_signal_used", "layer", "classification_source", "accepted_prediction_id", "review_required", "is_internal_transfer", "is_recurring", "project_id", "tax_section", "own_account_id", "own_account_kind", "counterparty_raw", "counterparty_id", "counterparty_kind", "suspected_transfer", "fy_key", "created_at", "updated_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_fy_idx` ON `transactions` (`fy_key`);--> statement-breakpoint
CREATE INDEX `transactions_flow_idx` ON `transactions` (`flow`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category`);--> statement-breakpoint
CREATE INDEX `transactions_review_idx` ON `transactions` (`review_required`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`txn_date`);--> statement-breakpoint
CREATE INDEX `transactions_classification_source_idx` ON `transactions` (`classification_source`);
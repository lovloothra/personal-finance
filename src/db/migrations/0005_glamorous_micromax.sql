CREATE TABLE `classification_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text,
	`match_signature` text NOT NULL,
	`raw_description` text NOT NULL,
	`merchant` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`flow` text NOT NULL,
	`amount` integer NOT NULL,
	`institution_id` text,
	`source` text NOT NULL,
	`reviewed_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `classification_feedback_sig_idx` ON `classification_feedback` (`match_signature`);--> statement-breakpoint
CREATE INDEX `classification_feedback_txn_idx` ON `classification_feedback` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `classification_feedback_source_idx` ON `classification_feedback` (`source`);--> statement-breakpoint
CREATE TABLE `classification_predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text,
	`model_version` text NOT NULL,
	`predicted_merchant` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`flow` text NOT NULL,
	`confidence_score` real NOT NULL,
	`confidence` text NOT NULL,
	`reason` text NOT NULL,
	`provenance` text NOT NULL,
	`evidence_ids` text DEFAULT '[]' NOT NULL,
	`decision` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `classification_predictions_txn_idx` ON `classification_predictions` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `classification_predictions_decision_idx` ON `classification_predictions` (`decision`);--> statement-breakpoint
CREATE TABLE `counterparties` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`kind` text NOT NULL,
	`matchers` text,
	`linked_own_account_id` text,
	`linked_own_account_kind` text,
	`is_own_money` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_classifier_heads` (
	`id` text PRIMARY KEY NOT NULL,
	`model_version` text NOT NULL,
	`embedding_model_id` text NOT NULL,
	`dimensions` integer NOT NULL,
	`labels` text NOT NULL,
	`weights` text NOT NULL,
	`bias` text NOT NULL,
	`example_count` integer NOT NULL,
	`checksum` text NOT NULL,
	`stale` integer DEFAULT false NOT NULL,
	`trained_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_model_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`feedback_id` text,
	`transaction_id` text,
	`signature` text NOT NULL,
	`raw_description` text NOT NULL,
	`merchant` text NOT NULL,
	`merchant_tokens` text DEFAULT '[]' NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`flow` text NOT NULL,
	`amount` integer NOT NULL,
	`amount_bucket` text NOT NULL,
	`direction` text NOT NULL,
	`institution_id` text,
	`source` text NOT NULL,
	`embedding` text DEFAULT '[]' NOT NULL,
	`embedding_model_id` text,
	`embedding_updated_at` integer,
	`reviewed_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `classification_feedback`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `local_model_examples_sig_idx` ON `local_model_examples` (`signature`);--> statement-breakpoint
CREATE INDEX `local_model_examples_category_idx` ON `local_model_examples` (`category`);--> statement-breakpoint
CREATE INDEX `local_model_examples_feedback_idx` ON `local_model_examples` (`feedback_id`);--> statement-breakpoint
CREATE TABLE `local_model_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`prediction_id` text,
	`transaction_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`prediction_id`) REFERENCES `classification_predictions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `local_model_suggestions_status_idx` ON `local_model_suggestions` (`status`);--> statement-breakpoint
CREATE INDEX `local_model_suggestions_txn_idx` ON `local_model_suggestions` (`transaction_id`);--> statement-breakpoint
ALTER TABLE `parsed_documents` ADD `account_last4` text;--> statement-breakpoint
ALTER TABLE `parsed_documents` ADD `own_account_id` text;--> statement-breakpoint
ALTER TABLE `parsed_documents` ADD `own_account_kind` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `classification_source` text DEFAULT 'deterministic' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `accepted_prediction_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `own_account_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `own_account_kind` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `counterparty_raw` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `counterparty_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `counterparty_kind` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `suspected_transfer` integer DEFAULT false;--> statement-breakpoint
CREATE INDEX `transactions_classification_source_idx` ON `transactions` (`classification_source`);
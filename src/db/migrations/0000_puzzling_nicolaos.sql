CREATE TABLE `accounts_bank` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`nickname` text,
	`last4` text,
	`account_type` text,
	`is_primary` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `accounts_broker` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`nickname` text,
	`client_code` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `accounts_card` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`nickname` text,
	`last4` text,
	`network` text,
	`credit_limit` integer,
	`statement_day` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `accounts_investment_platform` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`nickname` text,
	`kind` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`filename` text,
	`mime_type` text,
	`size_bytes` integer,
	`sha256` text NOT NULL,
	`path_on_disk` text,
	`locked` integer DEFAULT false,
	`unlock_method` text,
	`ocr_used` integer DEFAULT false,
	`status` text DEFAULT 'pending',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `gmail_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_sha256_idx` ON `attachments` (`sha256`);--> statement-breakpoint
CREATE TABLE `gmail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text,
	`thread_id` text,
	`from_addr` text,
	`subject` text,
	`internal_date` integer,
	`snippet` text,
	`matched_query` text,
	`institution_id` text,
	`has_attachments` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `gmail_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gmail_messages_run_idx` ON `gmail_messages` (`run_id`);--> statement-breakpoint
CREATE TABLE `gmail_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`fy_key` text,
	`query_count` integer DEFAULT 0,
	`message_count` integer DEFAULT 0,
	`attachment_count` integer DEFAULT 0,
	`bytes_estimated` integer DEFAULT 0,
	`bytes_downloaded` integer DEFAULT 0,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`legal_name` text,
	`category` text NOT NULL,
	`type` text,
	`aliases` text DEFAULT '[]',
	`sources` text DEFAULT '[]',
	`confidence` text DEFAULT 'high',
	`status` text DEFAULT 'active',
	`source` text DEFAULT 'pack:in' NOT NULL,
	`pack_version` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `institutions_category_idx` ON `institutions` (`category`);--> statement-breakpoint
CREATE INDEX `institutions_source_idx` ON `institutions` (`source`);--> statement-breakpoint
CREATE TABLE `insurance_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`kind` text,
	`policy_number_last4` text,
	`premium` integer,
	`cadence` text,
	`sum_assured` integer,
	`renewal_month` integer,
	`covers_self` integer DEFAULT true,
	`covers_parents` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `internal_transfer_links` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`debit_txn_id` text,
	`credit_txn_id` text,
	`confidence` text DEFAULT 'high',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`debit_txn_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_txn_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`kind` text,
	`principal` integer,
	`outstanding` integer,
	`emi_amount` integer,
	`emi_day` integer,
	`interest_rate` real,
	`start_date` text,
	`end_date` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern` text NOT NULL,
	`canonical_merchant` text NOT NULL,
	`category` text,
	`subcategory` text,
	`source` text DEFAULT 'pack:in' NOT NULL,
	`confidence` text DEFAULT 'high',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `merchant_aliases_pattern_idx` ON `merchant_aliases` (`pattern`);--> statement-breakpoint
CREATE TABLE `parsed_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`attachment_id` text,
	`message_id` text,
	`parser_id` text,
	`institution_id` text,
	`doc_type` text,
	`period_start` text,
	`period_end` text,
	`raw_text` text,
	`status` text DEFAULT 'parsed',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `gmail_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profile_annual_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` integer,
	`month` integer,
	`category` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_family` (
	`id` text PRIMARY KEY NOT NULL,
	`relation` text NOT NULL,
	`full_name` text,
	`dob` text,
	`is_dependent` integer DEFAULT false,
	`has_income` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_home` (
	`id` text PRIMARY KEY DEFAULT 'home' NOT NULL,
	`ownership` text,
	`monthly_rent` integer,
	`city_tier` text,
	`has_home_loan` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_house_help` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`monthly_amount` integer,
	`payment_mode` text,
	`upi_handle` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_lifestyle` (
	`id` text PRIMARY KEY DEFAULT 'lifestyle' NOT NULL,
	`data` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_one_time_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`budget` integer,
	`start_date` text,
	`end_date` text,
	`status` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_personal` (
	`id` text PRIMARY KEY DEFAULT 'self' NOT NULL,
	`full_name` text,
	`dob` text,
	`pan` text,
	`city` text,
	`residency_status` text,
	`primary_email` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` integer,
	`cadence` text,
	`category` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text,
	`title` text,
	`detail` text,
	`severity` text DEFAULT 'info',
	`status` text DEFAULT 'open',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_items_status_idx` ON `review_items` (`status`);--> statement-breakpoint
CREATE TABLE `subscriptions_detected` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text NOT NULL,
	`amount` integer,
	`cadence` text,
	`status` text DEFAULT 'likely',
	`first_seen` text,
	`last_seen` text,
	`next_charge_eta` text,
	`occurrences` integer DEFAULT 0,
	`category` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`fy_key` text NOT NULL,
	`section` text NOT NULL,
	`transaction_id` text,
	`amount` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
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
	`review_required` integer DEFAULT false,
	`is_internal_transfer` integer DEFAULT false,
	`is_recurring` integer DEFAULT false,
	`project_id` text,
	`tax_section` text,
	`fy_key` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `parsed_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `gmail_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `profile_one_time_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_fy_idx` ON `transactions` (`fy_key`);--> statement-breakpoint
CREATE INDEX `transactions_flow_idx` ON `transactions` (`flow`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category`);--> statement-breakpoint
CREATE INDEX `transactions_review_idx` ON `transactions` (`review_required`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`txn_date`);--> statement-breakpoint
CREATE TABLE `user_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text,
	`match_signature` text,
	`flow` text,
	`category` text,
	`subcategory` text,
	`merchant` text,
	`tax_section` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_overrides_sig_idx` ON `user_overrides` (`match_signature`);
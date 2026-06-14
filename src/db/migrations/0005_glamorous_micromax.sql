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
ALTER TABLE `parsed_documents` ADD `account_last4` text;--> statement-breakpoint
ALTER TABLE `parsed_documents` ADD `own_account_id` text;--> statement-breakpoint
ALTER TABLE `parsed_documents` ADD `own_account_kind` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `own_account_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `own_account_kind` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `counterparty_raw` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `counterparty_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `counterparty_kind` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `suspected_transfer` integer DEFAULT false;

CREATE TABLE `gmail_auth` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`wrapped_token` text NOT NULL,
	`email` text,
	`scope` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

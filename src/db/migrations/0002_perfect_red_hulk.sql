CREATE TABLE `document_passwords` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

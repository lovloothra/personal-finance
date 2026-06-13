ALTER TABLE `local_model_examples` ADD `embedding` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `local_model_examples` ADD `embedding_model_id` text;
--> statement-breakpoint
ALTER TABLE `local_model_examples` ADD `embedding_updated_at` integer;
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

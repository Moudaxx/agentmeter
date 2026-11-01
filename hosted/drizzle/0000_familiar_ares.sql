CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`label` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`environment` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `keys_owner` ON `api_keys` (`owner_id`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`owner_id` text NOT NULL,
	`environment` text NOT NULL,
	`event_key` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`input_price` real NOT NULL,
	`output_price` real NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `environment`, `event_key`)
);
--> statement-breakpoint
CREATE INDEX `usage_owner_time` ON `usage_events` (`owner_id`,`environment`,`created_at`);
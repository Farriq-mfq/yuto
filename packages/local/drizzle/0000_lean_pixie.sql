CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`initial_balance` integer DEFAULT 0 NOT NULL,
	`show_category` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "accounts_type_allowed" CHECK("accounts"."type" IN ('bank', 'ewallet', 'cash'))
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	CONSTRAINT "categories_kind_allowed" CHECK("categories"."kind" IN ('expense', 'income'))
);
--> statement-breakpoint
CREATE TABLE `transaction_items` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_qty_positive" CHECK("transaction_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`amount` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`note` text,
	`location_name` text,
	`address` text,
	`latitude` real,
	`longitude` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tx_amount_positive" CHECK("transactions"."amount" > 0),
	CONSTRAINT "transactions_kind_allowed" CHECK("transactions"."kind" IN ('expense', 'income'))
);
--> statement-breakpoint
CREATE INDEX `tx_time_idx` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transfer_amount_positive" CHECK("transfers"."amount" > 0),
	CONSTRAINT "transfer_distinct_accounts" CHECK("transfers"."from_account_id" <> "transfers"."to_account_id")
);

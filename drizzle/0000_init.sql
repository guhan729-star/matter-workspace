CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checklist_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`checklist_id` text NOT NULL,
	`item_id` text,
	`item_title` text DEFAULT '' NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`field` text,
	`old_value` text,
	`new_value` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checklist_activity_list` ON `checklist_activity` (`checklist_id`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`checklist_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`owner_id` text,
	`due_date` text,
	`source_document_id` text,
	`source_ref` text DEFAULT '' NOT NULL,
	`custom` text DEFAULT '{}' NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checklist_items_list` ON `checklist_items` (`checklist_id`);--> statement-breakpoint
CREATE TABLE `checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`matter_id` text NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`columns` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checklists_matter` ON `checklists` (`matter_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`matter_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`uploader_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_matter` ON `documents` (`matter_id`);--> statement-breakpoint
CREATE TABLE `matter_members` (
	`matter_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`matter_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `matter_members_user` ON `matter_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `matters` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`client` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `matters_org` ON `matters` (`org_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_thread` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `review_cells` (
	`review_id` text NOT NULL,
	`column_id` text NOT NULL,
	`document_id` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`reasoning` text DEFAULT '' NOT NULL,
	`quote` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`edited_by` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`locked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`column_id`, `document_id`)
);
--> statement-breakpoint
CREATE INDEX `review_cells_review` ON `review_cells` (`review_id`);--> statement-breakpoint
CREATE TABLE `review_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`label` text NOT NULL,
	`prompt` text NOT NULL,
	`format` text NOT NULL,
	`choices` text DEFAULT '[]' NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_columns_review` ON `review_columns` (`review_id`);--> statement-breakpoint
CREATE TABLE `review_documents` (
	`review_id` text NOT NULL,
	`document_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`review_id`, `document_id`)
);
--> statement-breakpoint
CREATE TABLE `review_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`columns` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`matter_id` text NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reviews_matter` ON `reviews` (`matter_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`matter_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`document_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `threads_matter` ON `threads` (`matter_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`matter_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`workflow_name` text NOT NULL,
	`author_id` text NOT NULL,
	`status` text NOT NULL,
	`inputs` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`output_format` text NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `workflow_runs_matter` ON `workflow_runs` (`matter_id`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`author_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`instructions` text NOT NULL,
	`slots` text NOT NULL,
	`output_format` text NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflows_org` ON `workflows` (`org_id`);
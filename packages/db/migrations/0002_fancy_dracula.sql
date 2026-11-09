ALTER TABLE "projects" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing projects have had no tracked change yet: their last change is when they were made.
UPDATE "projects" SET "updated_at" = "created_at";
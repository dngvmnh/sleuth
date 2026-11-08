CREATE TABLE "seals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"sealed_by" text NOT NULL,
	"sealed_at" timestamp with time zone NOT NULL,
	"script_version_id" text NOT NULL,
	"asset_version_id" text NOT NULL,
	"coverage" jsonb NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"broken_at" timestamp with time zone,
	"broken_reason" text,
	CONSTRAINT "seal_status" CHECK ("seals"."status" in ('active','broken')),
	CONSTRAINT "seal_signer_present" CHECK (length(trim("seals"."sealed_by")) > 0)
);
--> statement-breakpoint
ALTER TABLE "seals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "seals" ADD CONSTRAINT "seals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seals_one_active_per_project" ON "seals" USING btree ("project_id") WHERE "seals"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_one_active_per_request" ON "processing_jobs" USING btree ("project_id","request_key") WHERE "processing_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE POLICY "seals_read" ON "seals" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "seals_write" ON "seals" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));
CREATE TABLE "asset_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_versions_project_version" UNIQUE("project_id","version"),
	CONSTRAINT "asset_duration_range" CHECK ("asset_versions"."duration_ms" >= 0 and "asset_versions"."duration_ms" <= 180000)
);
--> statement-breakpoint
ALTER TABLE "asset_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evidence_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"checklist_item_id" text,
	"script_segment_id" text NOT NULL,
	"script_version_id" text NOT NULL,
	"segment_hash" text NOT NULL,
	"asset_version_id" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"transcript_segment_ids" text[] NOT NULL,
	"frame_observation_ids" text[] NOT NULL,
	"explanation" text NOT NULL,
	"confidence" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"analysis_run_id" text NOT NULL,
	CONSTRAINT "evidence_one_per_segment_and_video" UNIQUE("project_id","script_segment_id","asset_version_id"),
	CONSTRAINT "evidence_interval" CHECK ("evidence_candidates"."start_ms" >= 0 and "evidence_candidates"."start_ms" <= "evidence_candidates"."end_ms"),
	CONSTRAINT "evidence_confidence" CHECK ("evidence_candidates"."confidence" in ('low','medium','high')),
	CONSTRAINT "evidence_status" CHECK ("evidence_candidates"."status" in ('candidate','confirmed','rejected','stale','needs_reshoot','needs_outside_proof')),
	CONSTRAINT "evidence_source" CHECK ("evidence_candidates"."source" in ('ai','human'))
);
--> statement-breakpoint
ALTER TABLE "evidence_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"plain_label" text NOT NULL,
	"checklist_item_id" text,
	"script_segment_id" text,
	"evidence_id" text,
	"found" text NOT NULL,
	"not_found" text NOT NULL,
	"limits" text NOT NULL,
	"status" text NOT NULL,
	"analysis_run_id" text NOT NULL,
	CONSTRAINT "finding_type" CHECK ("findings"."type" in ('ghost','phantom_dialogue','cursed_frame','poltergeist','needs_outside_proof'))
);
--> statement-breakpoint
ALTER TABLE "findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "frame_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"asset_version_id" text NOT NULL,
	"timestamp_ms" integer NOT NULL,
	"description" text NOT NULL,
	"on_screen_text" jsonb NOT NULL,
	CONSTRAINT "frame_timestamp" CHECK ("frame_observations"."timestamp_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "frame_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_by" text,
	"heartbeat_at" timestamp with time zone,
	"error" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_status" CHECK ("processing_jobs"."status" in ('queued','running','succeeded','failed'))
);
--> statement-breakpoint
ALTER TABLE "processing_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"current_script_version_id" text,
	"current_asset_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reshoot_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"checklist_item_id" text,
	"script_segment_id" text,
	"finding_id" text,
	"note" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reshoot_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"decision" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reviewer_present" CHECK (length(trim("review_decisions"."reviewer_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "review_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "script_segments" (
	"id" text NOT NULL,
	"script_version_id" text NOT NULL,
	"project_id" text NOT NULL,
	"index" integer NOT NULL,
	"text" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "script_segments_script_version_id_id_pk" PRIMARY KEY("script_version_id","id")
);
--> statement-breakpoint
ALTER TABLE "script_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "script_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_versions_project_version" UNIQUE("project_id","version")
);
--> statement-breakpoint
ALTER TABLE "script_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"asset_version_id" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"words" jsonb NOT NULL,
	CONSTRAINT "transcript_interval" CHECK ("transcript_segments"."start_ms" >= 0 and "transcript_segments"."start_ms" <= "transcript_segments"."end_ms")
);
--> statement-breakpoint
ALTER TABLE "transcript_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_candidates" ADD CONSTRAINT "evidence_candidates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frame_observations" ADD CONSTRAINT "frame_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frame_observations" ADD CONSTRAINT "frame_observations_asset_version_id_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reshoot_tasks" ADD CONSTRAINT "reshoot_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_evidence_id_evidence_candidates_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_segments" ADD CONSTRAINT "script_segments_script_version_id_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "public"."script_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_segments" ADD CONSTRAINT "script_segments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_asset_version_id_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_project_idx" ON "evidence_candidates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "findings_project_idx" ON "findings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "processing_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "asset_versions_read" ON "asset_versions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "asset_versions_write" ON "asset_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "audit_events_read" ON "audit_events" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "audit_events_write" ON "audit_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "checklist_items_read" ON "checklist_items" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "checklist_items_write" ON "checklist_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "evidence_candidates_read" ON "evidence_candidates" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "evidence_candidates_write" ON "evidence_candidates" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "findings_read" ON "findings" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "findings_write" ON "findings" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "frame_observations_read" ON "frame_observations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "frame_observations_write" ON "frame_observations" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "processing_jobs_read" ON "processing_jobs" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "processing_jobs_write" ON "processing_jobs" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "projects_read" ON "projects" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ("projects"."is_demo" or "projects"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "projects_insert" ON "projects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("projects"."owner_id" = (select auth.uid()) and not "projects"."is_demo");--> statement-breakpoint
CREATE POLICY "projects_modify" ON "projects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("projects"."owner_id" = (select auth.uid()) and not "projects"."is_demo") WITH CHECK ("projects"."owner_id" = (select auth.uid()) and not "projects"."is_demo");--> statement-breakpoint
CREATE POLICY "projects_delete" ON "projects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("projects"."owner_id" = (select auth.uid()) and not "projects"."is_demo");--> statement-breakpoint
CREATE POLICY "reshoot_tasks_read" ON "reshoot_tasks" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "reshoot_tasks_write" ON "reshoot_tasks" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "review_decisions_read" ON "review_decisions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "review_decisions_write" ON "review_decisions" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "script_segments_read" ON "script_segments" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "script_segments_write" ON "script_segments" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "script_versions_read" ON "script_versions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "script_versions_write" ON "script_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "transcript_segments_read" ON "transcript_segments" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "transcript_segments_write" ON "transcript_segments" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = (select auth.uid())));
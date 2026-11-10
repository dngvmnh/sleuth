"use client";

import { useId, useState } from "react";
import type { z } from "zod";
import {
  MAX_VIDEO_SECONDS,
  type UploadUrlRequestSchema,
  type UploadUrlResponseSchema,
} from "@sleuth/contracts";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import {
  checkDurationMs,
  checkFile,
  isAllowedVideoType,
  readVideoDurationMs,
  SIZE_LIMIT_MESSAGE,
  TYPE_LIMIT_MESSAGE,
} from "./duration";

type UploadUrlRequest = z.infer<typeof UploadUrlRequestSchema>;
type UploadUrlResponse = z.infer<typeof UploadUrlResponseSchema>;

export type UploadResult = "uploaded" | "skipped_in_fixture_mode";

/**
 * Sends the bytes to the signed URL with progress. Fixture mode has no storage: the server
 * answers with a `fixture://` URL and nothing is sent.
 */
export function uploadBytes(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  if (url.startsWith("fixture://")) {
    onProgress(1);
    return Promise.resolve("skipped_in_fixture_mode");
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve("uploaded")
        : reject(new Error(`The upload was refused (status ${xhr.status}).`));
    xhr.onerror = () =>
      reject(new Error("The upload stopped. Check the connection and try again."));
    xhr.send(file);
  });
}

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "refused"; message: string }
  | { kind: "requesting" }
  | { kind: "uploading"; fraction: number }
  | { kind: "failed"; step: string; message: string }
  | { kind: "done"; result: UploadResult; version: number };

/** What a 400 from the server means for a person, using the reason code when it is there. */
function refusalOf(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.status !== 400) return null;
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  if (reason === "video_too_large" || reason === "invalid_size") return SIZE_LIMIT_MESSAGE;
  if (reason === "video_too_long")
    return "This video is longer than " + MAX_VIDEO_SECONDS + " seconds. Trim it and try again.";
  return TYPE_LIMIT_MESSAGE + " Files must also be up to 50 MB.";
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

export interface UploadFlowProps {
  readOnly: boolean;
  requestUploadUrl: (params: UploadUrlRequest) => Promise<UploadUrlResponse>;
  /** Called after a new video version exists, so the workspace can reload. */
  onUploaded: () => void | Promise<void>;
  readDuration?: (file: File) => Promise<number>;
  upload?: typeof uploadBytes;
}

/**
 * Pick a video, check its length in the browser, ask for an upload URL, upload with progress.
 * A failure keeps the chosen file so Try again repeats only the failed part. The script and
 * checklist editors are separate and keep their own unsaved text.
 */
export function UploadFlow({
  readOnly,
  requestUploadUrl,
  onUploaded,
  readDuration = readVideoDurationMs,
  upload = uploadBytes,
}: UploadFlowProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [file, setFile] = useState<{ file: File; durationMs: number } | null>(null);
  const inputId = useId();
  const limitsId = useId();
  const busy =
    phase.kind === "reading" || phase.kind === "requesting" || phase.kind === "uploading";

  const send = async (chosen: { file: File; durationMs: number }) => {
    const mimeType = chosen.file.type;
    if (!isAllowedVideoType(mimeType)) {
      setPhase({ kind: "refused", message: TYPE_LIMIT_MESSAGE });
      return;
    }
    setPhase({ kind: "requesting" });
    let target: UploadUrlResponse;
    try {
      target = await requestUploadUrl({
        fileName: chosen.file.name.slice(0, 200) || "video",
        mimeType,
        sizeBytes: chosen.file.size,
        durationMs: chosen.durationMs,
      });
    } catch (e: unknown) {
      // A 400 means the file itself is not allowed. Nothing was uploaded, and retrying cannot help.
      const refusal = refusalOf(e);
      if (refusal) {
        setFile(null);
        setPhase({ kind: "refused", message: refusal });
        return;
      }
      setPhase({
        kind: "failed",
        step: "Asking the server for an upload address failed.",
        message: messageOf(e),
      });
      return;
    }
    setPhase({ kind: "uploading", fraction: 0 });
    try {
      const result = await upload(target.uploadUrl, chosen.file, (fraction) =>
        setPhase({ kind: "uploading", fraction }),
      );
      setPhase({ kind: "done", result, version: target.assetVersion.version });
      await onUploaded();
    } catch (e: unknown) {
      setPhase({ kind: "failed", step: "Uploading the video failed.", message: messageOf(e) });
    }
  };

  const choose = async (picked: File | undefined) => {
    if (!picked || busy) return;
    setFile(null);
    if (!picked.type.startsWith("video/")) {
      setPhase({ kind: "refused", message: "This is not a video file. Choose a video." });
      return;
    }
    const fileCheck = checkFile(picked);
    if (!fileCheck.ok) {
      setPhase({ kind: "refused", message: fileCheck.message });
      return;
    }
    setPhase({ kind: "reading" });
    let durationMs: number;
    try {
      durationMs = await readDuration(picked);
    } catch (e: unknown) {
      setPhase({ kind: "refused", message: messageOf(e) });
      return;
    }
    const check = checkDurationMs(durationMs);
    if (!check.ok) {
      setPhase({ kind: "refused", message: check.message });
      return;
    }
    const chosen = { file: picked, durationMs };
    setFile(chosen);
    await send(chosen);
  };

  return (
    <section
      aria-labelledby="upload-heading"
      className="rounded-md border border-line bg-surface p-4"
    >
      <h2 id="upload-heading" className="font-display text-lg text-foreground">
        Upload a video
      </h2>
      <p id={limitsId} className="mt-1 text-sm text-muted">
        Limits: one English video, up to {MAX_VIDEO_SECONDS} seconds, and a plain-text script. A new
        video makes the evidence for the old one out of date.
      </p>

      {readOnly ? (
        <p className="mt-2 text-sm text-muted">
          The demo is read-only. Make an editable copy to upload a video.
        </p>
      ) : (
        <div className="mt-3">
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            Choose a video file
          </label>
          <input
            id={inputId}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            disabled={busy}
            aria-describedby={limitsId}
            onChange={(e) => {
              const picked = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              void choose(picked);
            }}
            className="mt-1 block w-full text-sm text-muted"
          />
        </div>
      )}

      <div className="mt-3 text-sm" aria-live="polite">
        {phase.kind === "reading" ? <p role="status">Reading the video length...</p> : null}
        {phase.kind === "requesting" ? (
          <p role="status">Asking the server where to upload...</p>
        ) : null}
        {phase.kind === "uploading" ? (
          <div role="status">
            <p>Uploading: {Math.round(phase.fraction * 100)}%</p>
            <progress
              className="mt-1 w-full"
              max={100}
              value={Math.round(phase.fraction * 100)}
              aria-label="Upload progress"
            />
          </div>
        ) : null}
        {phase.kind === "done" ? (
          <div role="status" className="rounded-md border border-line p-3">
            <p className="font-medium text-foreground">Video version {phase.version} saved.</p>
            {phase.result === "skipped_in_fixture_mode" ? (
              <p className="mt-1 text-muted">
                Fixture mode has no storage, so the file was not sent anywhere. Only its name and
                length were saved.
              </p>
            ) : null}
            <p className="mt-1 text-muted">
              Evidence for the old video is now out of date. Run an analysis to check the new one.
            </p>
          </div>
        ) : null}
      </div>

      {phase.kind === "refused" ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {phase.message}
        </p>
      ) : null}
      {phase.kind === "failed" ? (
        <div role="alert" className="mt-2 text-sm">
          <p className="font-medium text-danger">{phase.step}</p>
          <p className="mt-1 text-muted">{phase.message}</p>
          <p className="mt-1 text-muted">Your script and checklist are not changed.</p>
          {file ? (
            <Button className="mt-2" size="sm" variant="outline" onClick={() => void send(file)}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

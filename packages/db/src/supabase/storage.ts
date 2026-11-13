import { createClient } from "@supabase/supabase-js";

/** What the store needs from file storage. */
export interface StorageClient {
  /**
   * A one-use URL the browser can upload to. `expiresAt` is the real expiry of the URL, read from
   * its token, not a promise made up by this code.
   */
  createSignedUploadUrl(path: string): Promise<{ url: string; expiresAt: string }>;
  /** Delete files. Missing files are not an error. */
  remove(paths: string[]): Promise<void>;
  /** When the file at `path` landed in storage (ISO), or null if nothing is there. */
  uploadedAt(path: string): Promise<string | null>;
  /**
   * A read URL, valid `seconds` (default `DOWNLOAD_URL_SECONDS`, the worker's download). The web
   * server passes `PLAYBACK_URL_SECONDS` for the owner's player. Server and worker only.
   */
  createSignedDownloadUrl(
    path: string,
    seconds?: number,
  ): Promise<{ url: string; expiresAt: string }>;
}

/** Lifetime of a worker's download URL: long enough to fetch a 3-minute video, no longer. */
export const DOWNLOAD_URL_SECONDS = 300;

/**
 * Lifetime of the owner's playback URL. A browser keeps fetching byte ranges from the same URL while
 * the person plays, pauses and seeks, so it must outlast a review of a 3-minute clip (about three
 * full plays with seeking). Ten minutes does that and keeps a copied link short-lived. When it
 * expires the player asks for a new one; the URL is never stored.
 */
export const PLAYBACK_URL_SECONDS = 600;

/**
 * How long after the upload URL is made the file must land (ingestion 2.1). Supabase signed upload
 * URLs live about two hours and cannot be shortened, so the store enforces this window itself:
 * `expiresAt` says when the window closes, and analysis refuses a file that landed after it.
 */
export const UPLOAD_WINDOW_MS = 5 * 60_000;

export interface StorageConfig {
  /** NEXT_PUBLIC_SUPABASE_URL */
  url: string;
  /** SUPABASE_SERVICE_ROLE_KEY. Server only: it never appears in a URL or a response. */
  serviceRoleKey: string;
  /** Private bucket. Default `video-assets` (SUPABASE_STORAGE_BUCKET). */
  bucket?: string;
}

/** A storage failure. The message never carries the key, the URL or the file path. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/** The `exp` claim (seconds) of a JWT, or null if the token is not one. */
export function tokenExpiry(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

/** Supabase Storage through the service role. Server and worker only. */
export function createStorageClient(config: StorageConfig): StorageClient {
  const bucket = config.bucket ?? "video-assets";
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const files = () => client.storage.from(bucket);

  return {
    async createSignedUploadUrl(path) {
      const { data, error } = await files().createSignedUploadUrl(path);
      if (error || !data) throw new StorageError("Could not create an upload URL.");
      const exp = tokenExpiry(data.token);
      if (exp === null) throw new StorageError("Storage returned an upload URL with no expiry.");
      return { url: data.signedUrl, expiresAt: new Date(exp * 1000).toISOString() };
    },

    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await files().remove(paths);
      if (error) throw new StorageError("Could not delete files from storage.");
    },

    async createSignedDownloadUrl(path, seconds = DOWNLOAD_URL_SECONDS) {
      const { data, error } = await files().createSignedUrl(path, seconds);
      if (error || !data) throw new StorageError("Could not create a download URL.");
      const token = new URL(data.signedUrl).searchParams.get("token") ?? "";
      const exp = tokenExpiry(token);
      if (exp === null) throw new StorageError("Storage returned a download URL with no expiry.");
      return { url: data.signedUrl, expiresAt: new Date(exp * 1000).toISOString() };
    },

    async uploadedAt(path) {
      const cut = path.lastIndexOf("/");
      const folder = cut < 0 ? "" : path.slice(0, cut);
      const name = path.slice(cut + 1);
      const { data, error } = await files().list(folder, { search: name, limit: 100 });
      if (error) throw new StorageError("Could not check the uploaded file.");
      // `search` matches a prefix, so pick the exact name.
      const file = (data ?? []).find((f) => f.name === name);
      return file?.created_at ? new Date(file.created_at).toISOString() : null;
    },
  };
}

/** Build a storage client from the environment, or null when storage is not configured. */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): StorageClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  const bucket = env.SUPABASE_STORAGE_BUCKET?.trim();
  return createStorageClient({ url, serviceRoleKey, ...(bucket ? { bucket } : {}) });
}

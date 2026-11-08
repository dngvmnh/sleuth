/** What the store needs from file storage. The Supabase implementation arrives with task 7. */
export interface StorageClient {
  /** A one-use URL the browser can upload to. Expires within five minutes. */
  createSignedUploadUrl(path: string): Promise<{ url: string; expiresAt: string }>;
  /** Delete files. Missing files are not an error. */
  remove(paths: string[]): Promise<void>;
}

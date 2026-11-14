import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto max-w-xl p-8 text-center">
      <p className="text-xs uppercase tracking-widest text-muted">Error 404</p>
      <h1 className="mt-2 font-display text-3xl text-foreground">
        This page <em>vanished</em>
      </h1>
      <p className="mt-3 text-sm text-muted">
        There is no page at this address. It may have been moved, or the project may have been deleted.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-md border border-primary bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-strong"
      >
        Back to your projects
      </Link>
    </main>
  );
}
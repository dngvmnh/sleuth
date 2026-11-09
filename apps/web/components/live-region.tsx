/**
 * A polite live region for screen readers. Visually hidden; it announces `message`
 * when the text changes. It never takes focus.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

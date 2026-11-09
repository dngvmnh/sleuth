/**
 * Shown in place of the video in fixture mode. It says plainly that no footage is played:
 * the timeline and sentence list run on a simulated clock.
 */
export function NoVideoPanel() {
  return (
    <section
      aria-labelledby="no-video-heading"
      className="rounded-md border border-warn bg-surface p-6"
    >
      <h2 id="no-video-heading" className="font-display text-xl text-foreground">
        No video in fixture mode
      </h2>
      <p className="mt-2 text-sm text-muted">
        Fixture mode has no video file, so nothing here plays real footage. The timeline and the
        sentence list still work: they run on a simulated clock that you can play, pause and move.
      </p>
      <p className="mt-2 text-sm text-muted">
        Times shown come from the fixture data. They do not prove that the footage matches.
      </p>
    </section>
  );
}

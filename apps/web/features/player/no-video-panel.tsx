/**
 * Shown in place of the video when nothing plays: the demo, fixture mode, or a project whose
 * file is not in storage. It says plainly that no footage is played: the timeline and the
 * sentence list run on a simulated clock.
 */
export function NoVideoPanel() {
  return (
    <section
      aria-labelledby="no-video-heading"
      className="rounded-md border border-warn bg-surface p-6"
    >
      <h2 id="no-video-heading" className="font-display text-xl text-foreground">
        No playable video file
      </h2>
      <p className="mt-2 text-sm text-muted">
        This project has no video file to play. The public demo is one example, and fixture mode never has one.
        The timeline and the sentence list still work: they run on a simulated clock that you can play, pause
        and move.
      </p>
      <p className="mt-2 text-sm text-muted">
        Times shown come from the analysis data. They do not prove that the footage matches.
      </p>
    </section>
  );
}
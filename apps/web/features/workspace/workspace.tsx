"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FINDING_LABELS,
  type EvidenceCandidate,
  type FindingType,
  type ReviewDecisionKind,
} from "@sleuth/contracts";
import { ErrorState, LoadingSkeleton } from "@/components/state-panel";
import { LiveRegion } from "@/components/live-region";
import type { ApiClient } from "@/lib/api-client";
import { ExorcismActions } from "../lantern/actions";
import { Lantern } from "../lantern/lantern";
import { NoVideoPanel } from "../player/no-video-panel";
import { PlaybackVideo } from "../player/playback-video";
import { usePlaybackUrl } from "../player/use-playback-url";
import { useVideoPlayer } from "../player/use-video-player";
import { SimulatedClock } from "../player/simulated-clock";
import { useSimulatedPlayer } from "../player/use-simulated-player";
import { SentenceList, type SentenceListHandle } from "../script/sentence-list";
import { buildMarkers, formatSeconds, primaryMarkerFor, type TimelineMarker } from "../timeline/markers";
import { segmentAtMs } from "../timeline/segment-at";
import { deriveSegmentStates } from "@sleuth/domain";
import { Timeline } from "../timeline/timeline";
import { CoverageBar } from "./coverage-bar";
import { EditorsPanel } from "./editors-panel";
import { useProject, type ProjectState } from "./use-project";

const FINDING_ORDER: FindingType[] = [
  "ghost",
  "phantom_dialogue",
  "cursed_frame",
  "poltergeist",
  "needs_outside_proof",
];

/** Clock length: the video length when the project has one, otherwise the end of the last evidence. */
function clockDurationMs(state: ProjectState): number {
  const fromVideo = state.detail?.assetVersion?.durationMs;
  if (fromVideo !== undefined) return fromVideo;
  return state.evidence.reduce((max, e) => Math.max(max, e.endMs), 0);
}

function Header({ state }: { state: ProjectState }) {
  const project = state.detail?.project;
  if (!project) return null;
  const open = state.findings.filter((f) => f.status === "open").length;
  return (
    <header>
      <p className="text-sm">
        <Link className="text-primary-strong underline-offset-4 hover:underline" href="/">
          Back to dashboard
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl tracking-tight">{project.name}</h1>
      {project.isDemo ? (
        <p className="mt-2">
          <span className="rounded border border-line px-2 py-0.5 text-xs text-muted">
            Public demo, read-only
          </span>
        </p>
      ) : null}
      <p className="mt-3 text-sm text-muted" data-testid="workspace-counts">
        {state.evidence.length} evidence {state.evidence.length === 1 ? "candidate" : "candidates"},{" "}
        {state.findings.length} {state.findings.length === 1 ? "finding" : "findings"} ({open} open)
      </p>
      <p className="mt-1 text-sm text-muted">
        Every match is a candidate. Only a person confirms it.
      </p>
      <p className="mt-2 text-sm">
        <Link
          className="text-primary-strong underline-offset-4 hover:underline"
          href={`/projects/${encodeURIComponent(project.id)}/report`}
        >
          Open the Final Seal report
        </Link>
      </p>
    </header>
  );
}

function FindingCounts({ state }: { state: ProjectState }) {
  return (
    <section aria-labelledby="findings-heading" className="rounded-md border border-line bg-surface p-4">
      <h2 id="findings-heading" className="font-display text-lg text-foreground">
        Findings
      </h2>
      {state.findings.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No findings for this project.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {FINDING_ORDER.map((type) => {
            const count = state.findings.filter((f) => f.type === type && f.status === "open").length;
            if (count === 0) return null;
            const label = FINDING_LABELS[type];
            return (
              <li key={type}>
                {label.spooky} <span className="text-muted">({label.plain})</span>: {count} open
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface Selection {
  segmentId: string | null;
  evidenceId: string | null;
}

/**
 * The loaded workspace. One player (the real video when there is a playback URL, else the simulated clock) feeds the timeline playhead, the
 * sentence highlight and the Lantern, so they can never disagree about the time.
 */
function WorkspaceView({ state, initialLine }: { state: ProjectState; initialLine?: string }) {
  const simulated = useSimulatedPlayer(clockDurationMs(state));
  // A real video, when the server hands out a playback URL. Otherwise the simulated clock.
  const playbackUrl = usePlaybackUrl(state.fetchPlaybackUrl, state.detail?.assetVersion?.id);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const real = useVideoPlayer(playbackUrl ? videoElement : null);
  const clock = real
    ? { ...real, durationMs: real.durationMs > 0 ? real.durationMs : simulated.durationMs }
    : simulated;
  const { player } = clock;
  const sentences = useRef<SentenceListHandle>(null);
  const partEndMs = useRef<number | null>(null);
  // A link such as the dashboard's clue card can open the workspace on one line (?line=<segment id>).
  const [selection, setSelection] = useState<Selection>(() => {
    const all = state.detail?.scriptVersion?.segments ?? [];
    const segment = all.find((s) => s.id === initialLine);
    if (!segment) return { segmentId: null, evidenceId: null };
    return { segmentId: segment.id, evidenceId: primaryMarkerFor(buildMarkers(all, state.evidence), segment.id)?.id ?? null };
  });
  const [announcement, setAnnouncement] = useState("");

  const segments = useMemo(
    () => [...(state.detail?.scriptVersion?.segments ?? [])].sort((a, b) => a.index - b.index),
    [state.detail],
  );
  const states = useMemo(() => deriveSegmentStates(segments, state.evidence), [segments, state.evidence]);
  const markers = useMemo(() => buildMarkers(segments, state.evidence), [segments, state.evidence]);

  // Opened on a line: move the clock to its evidence once.
  const openedOn = useRef(selection.evidenceId);
  useEffect(() => {
    const marker = markers.find((m) => m.id === openedOn.current);
    openedOn.current = null;
    if (marker) player.seek(marker.startMs);
    // Only on the first render of this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Play this part" stops at the end of the part; any other pause, seek or end cancels it.
  useEffect(
    () =>
      player.on((change) => {
        if (change.kind === "time") {
          if (partEndMs.current !== null && change.currentMs >= partEndMs.current) {
            partEndMs.current = null;
            player.pause();
          }
        } else if (change.kind !== "play") {
          partEndMs.current = null;
        }
      }),
    [player],
  );

  const playingSegmentId = clock.playing
    ? (segmentAtMs(
        markers.filter((m) => m.state !== "stale"),
        clock.currentMs,
      )?.segmentId ?? null)
    : null;

  const selectSegment = (segmentId: string) => {
    const segment = segments.find((s) => s.id === segmentId);
    if (!segment) return;
    const marker = primaryMarkerFor(markers, segmentId);
    setSelection({ segmentId, evidenceId: marker?.id ?? null });
    if (marker) {
      player.seek(marker.startMs);
      setAnnouncement(
        `Line ${segment.index + 1} selected. The clock moved to ${formatSeconds(marker.startMs)} seconds.`,
      );
    } else {
      setAnnouncement(`Line ${segment.index + 1} has no evidence, so the clock did not move.`);
    }
  };

  const selectMarker = (marker: TimelineMarker) => {
    setSelection({ segmentId: marker.segmentId, evidenceId: marker.id });
    player.seek(marker.startMs);
    sentences.current?.focusSegment(marker.segmentId);
  };

  const leaveTimeline = () => {
    const target = selection.segmentId ?? segments[0]?.id;
    if (target) sentences.current?.focusSegment(target);
  };

  const playPart = (startMs: number, endMs: number) => {
    player.seek(startMs);
    partEndMs.current = endMs;
    player.play();
  };

  const DONE_TEXT: Record<ReviewDecisionKind, string> = {
    confirm: "confirmed by you",
    reject: "rejected",
    needs_reshoot: "marked as needing a reshoot",
    needs_outside_proof: "marked as needing outside proof",
  };

  const decide = async (target: EvidenceCandidate, line: number, decision: ReviewDecisionKind) => {
    const ok = await state.review(target.id, { decision });
    setAnnouncement(
      ok
        ? `Evidence for line ${line} ${DONE_TEXT[decision]}.`
        : `The decision for line ${line} was not saved.`,
    );
  };

  const askReshoot = async (target: EvidenceCandidate, line: number, note: string) => {
    const ok = await state.reshoot(target, note);
    setAnnouncement(
      ok
        ? `Evidence for line ${line} marked as needing a reshoot. A reshoot task was created.`
        : `The reshoot request for line ${line} was not completed.`,
    );
  };

  const selectedSegment = segments.find((s) => s.id === selection.segmentId);
  const selectedEvidence = state.evidence.find((e) => e.id === selection.evidenceId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <Header state={state} />
      <CoverageBar
        covered={segments.filter((s) => states[s.id] === "covered").length}
        total={segments.length}
      />

      {state.status === "empty" ? (
        <div role="status" className="rounded-md border border-line bg-surface p-6">
          <p className="font-display text-lg">Nothing to review yet</p>
          <p className="mt-1 text-sm text-muted">
            This project has no script and no evidence candidates. Nothing was checked, so no
            finding is shown.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section aria-label="Player">
            {playbackUrl ? (
              <PlaybackVideo url={playbackUrl} onElement={setVideoElement} />
            ) : (
              <>
                <NoVideoPanel />
                <SimulatedClock clock={simulated} />
              </>
            )}
          </section>
          <Timeline
            markers={markers}
            durationMs={clock.durationMs}
            currentMs={clock.currentMs}
            selectedId={selection.evidenceId}
            onSelect={selectMarker}
            onEscape={leaveTimeline}
          />
          <SentenceList
            ref={sentences}
            segments={segments}
            states={states}
            selectedSegmentId={selection.segmentId}
            playingSegmentId={playingSegmentId}
            onSelect={selectSegment}
          />
        </div>
        <div className="space-y-6">
          <Lantern
            segment={selectedSegment}
            evidence={selectedEvidence}
            findings={state.findings}
            onPlayPart={playPart}
            actions={
              selectedEvidence && selectedSegment ? (
                <ExorcismActions
                  key={selectedEvidence.id}
                  evidence={selectedEvidence}
                  isDemo={state.detail?.project.isDemo ?? true}
                  pending={state.reviewingId !== undefined}
                  error={state.reviewErrorId === selectedEvidence.id ? state.reviewError : undefined}
                  onDecide={(decision) => void decide(selectedEvidence, selectedSegment.index + 1, decision)}
                  onReshoot={(note) => void askReshoot(selectedEvidence, selectedSegment.index + 1, note)}
                />
              ) : undefined
            }
          />
          <FindingCounts state={state} />
        </div>
      </div>
      <EditorsPanel state={state} />
      <LiveRegion message={announcement} />
    </div>
  );
}

export function Workspace({
  projectId,
  client,
  initialLine,
}: {
  projectId: string;
  client?: ApiClient;
  /** Segment id to open on, from ?line=. Unknown ids are ignored. */
  initialLine?: string;
}) {
  const state = useProject(projectId, client);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <LoadingSkeleton label="Loading project" />
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div role="alert" className="rounded-md border border-line bg-surface p-6">
          <h1 className="font-display text-2xl">Project not found</h1>
          <p className="mt-2 text-sm text-muted">
            This project does not exist, or you do not have access to it.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-primary-strong underline-offset-4 hover:underline" href="/">
              Back to dashboard
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ErrorState
          message={state.errorMessage ?? "The project could not be loaded."}
          onRetry={state.refresh}
        />
      </div>
    );
  }

  // The key gives a different clock length a fresh player.
  return <WorkspaceView key={`${projectId}:${clockDurationMs(state)}`} state={state} initialLine={initialLine} />;
}

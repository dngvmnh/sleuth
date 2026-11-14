import { Icon, type IconProps } from "./icon";

// Each finding type has its own mark. Always show the plain label next to it (decision D-18).

/** Ghost: a checklist item with no footage. A sheet with two eyes and a ragged hem. */
export function GhostIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 20V10a7 7 0 0 1 14 0v10l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6Z" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Phantom Dialogue: a scripted line that was never said. An empty, dashed speech bubble. */
export function PhantomDialogueIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5Z"
        strokeDasharray="2.5 2.5"
      />
    </Icon>
  );
}

/** Cursed Frame: weak visual match. A picture frame with a crack through it. */
export function CursedFrameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="m13 4.5-2 4.5 3 2.5-2.5 4 1.5 4" />
    </Icon>
  );
}

/** Poltergeist: evidence made stale by a change. Two arrows chasing each other. */
export function PoltergeistIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 8.5A7.5 7.5 0 0 0 5.5 7" />
      <path d="M5 4v3.5h3.5" />
      <path d="M5 15.5A7.5 7.5 0 0 0 18.5 17" />
      <path d="M19 20v-3.5h-3.5" />
    </Icon>
  );
}

/** Needs Outside Proof: a claim footage cannot prove. A page with an arrow leaving it. */
export function NeedsOutsideProofIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h7" />
      <path d="M8 9h5M8 12.5h3" />
      <path d="M15 14.5 20.5 9M16.5 9h4v4" />
    </Icon>
  );
}

/** The Evidence Lantern panel. */
export function LanternIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 3.5h5M12 2v1.5" />
      <path d="M8 6h8l-1 2H9Z" />
      <path d="M9 8h6v9.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 17.5Z" />
      <path d="M12 11.5c1 1 1 2.5 0 3.5-1-1-1-2.5 0-3.5Z" />
      <path d="M8 21h8" />
    </Icon>
  );
}

/** A video. */
export function FilmReelIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="7" r="1.75" />
      <circle cx="16.75" cy="10.5" r="1.75" />
      <circle cx="15" cy="16" r="1.75" />
      <circle cx="9" cy="16" r="1.75" />
      <circle cx="7.25" cy="10.5" r="1.75" />
    </Icon>
  );
}

/** The Final Seal: a wax seal with a ribbon. */
export function WaxSealIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 14 5l2.4-.3.9 2.3 2.2 1-.4 2.4L20.5 12l-1.4 1.6.4 2.4-2.2 1-.9 2.3L14 19 12 20.5 10 19l-2.4.3-.9-2.3-2.2-1 .4-2.4L3.5 12l1.4-1.6-.4-2.4 2.2-1 .9-2.3L10 5Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5v13l10-6.5Z" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 5.5v13M15.5 5.5v13" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Icon>
  );
}

/** Points right; rotate it with a class for other directions. */
export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Icon>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5Z" />
      <path d="M13.5 3.5v6h6" />
    </Icon>
  );
}

// ---- shell marks (brief 007) ----

/** The wordmark glyph: an old door key with a round bow and two teeth. */
export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="12" r="3.5" />
      <circle cx="7" cy="12" r="1.2" />
      <path d="M10.5 12H20.5M17 12v3M19.5 12v2" />
    </Icon>
  );
}

/** Night wind: a crescent moon with three wind lines drifting past it. */
export function CrescentWindIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 3.5a6.5 6.5 0 1 0 6 9 5 5 0 0 1-6-9Z" />
      <path d="M3 17.5h8.5a1.8 1.8 0 1 0-1.8-1.8M5 20.5h10M2.5 14.5h4" />
    </Icon>
  );
}

/** The reviewer: a hooded figure seen from the front, the face left in shadow. */
export function HoodedFigureIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3c-3.6 0-6 3-6 6.8 0 2.2-.8 3.6-2 4.7L5 21h14l1-6.5c-1.2-1.1-2-2.5-2-4.7C18 6 15.6 3 12 3Z" />
      <path d="M9 11.5c0-2 1.3-3.5 3-3.5s3 1.5 3 3.5-1.3 3-3 3-3-1-3-3Z" />
    </Icon>
  );
}

import type { FindingType } from "@sleuth/contracts";
import type { ComponentType } from "react";
import type { IconProps } from "./icon";
import {
  CursedFrameIcon,
  GhostIcon,
  NeedsOutsideProofIcon,
  PhantomDialogueIcon,
  PoltergeistIcon,
} from "./icons";

export { Icon, type IconProps } from "./icon";
export * from "./icons";

/** The mark for each finding type. Show it beside the label, never instead of it. */
export const FINDING_ICONS: Record<FindingType, ComponentType<IconProps>> = {
  ghost: GhostIcon,
  phantom_dialogue: PhantomDialogueIcon,
  cursed_frame: CursedFrameIcon,
  poltergeist: PoltergeistIcon,
  needs_outside_proof: NeedsOutsideProofIcon,
};

import { useId, type ReactNode, type SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /**
   * Give a title only when the icon carries meaning on its own (no visible text beside it).
   * Without one the icon is decorative and hidden from screen readers.
   */
  title?: string;
  /** Width and height in px. Default 20. */
  size?: number;
}

/**
 * The shared frame of every SLEUTH icon: a 24 by 24 grid, drawn with `currentColor`, so an icon
 * takes the text colour of its parent and works in every theme, in print and in forced colours.
 * Original drawings only (decision D-16). No icon library.
 */
export function Icon({ title, size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  const titleId = useId();
  const labelled = title !== undefined && title !== "";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(labelled ? { role: "img", "aria-labelledby": titleId } : { "aria-hidden": true })}
      {...rest}
    >
      {labelled ? <title id={titleId}>{title}</title> : null}
      {children}
    </svg>
  );
}

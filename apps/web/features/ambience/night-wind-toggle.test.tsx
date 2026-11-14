import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext, fakeContextFactory } from "./fake-audio-context";
import { NIGHT_WIND_MAX_GAIN, NightWind } from "./night-wind";
import { NightWindToggle } from "./night-wind-toggle";
import { MEDIA_EVENT, NIGHT_WIND_KEY } from "./use-night-wind";

const engine = () => new NightWind({ createContext: fakeContextFactory(), random: () => 0.5 });
const ctx = () => FakeAudioContext.created.at(-1) as FakeAudioContext;
const media = (detail: "play" | "pause") =>
  act(() => {
    window.dispatchEvent(new CustomEvent(MEDIA_EVENT, { detail }));
  });
const setVisibility = (state: "hidden" | "visible") =>
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  });

beforeEach(() => {
  FakeAudioContext.created = [];
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NightWindToggle", () => {
  it("is off by default and creates no AudioContext on page load", () => {
    render(<NightWindToggle createEngine={engine} />);
    const button = screen.getByRole("button", { name: "Night wind: off" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(FakeAudioContext.created).toHaveLength(0);
    expect(screen.queryByLabelText("Night wind volume")).toBeNull();
  });

  it("starts only after a click, and remembers the choice", async () => {
    render(<NightWindToggle createEngine={engine} />);
    await userEvent.click(screen.getByRole("button", { name: "Night wind: off" }));
    expect(FakeAudioContext.created).toHaveLength(1);
    const button = screen.getByRole("button", { name: "Night wind: on" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem(NIGHT_WIND_KEY)).toBe("on");
    expect(screen.getByLabelText("Night wind volume")).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Night wind: off" })).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem(NIGHT_WIND_KEY)).toBe("off");
  });

  it("asks for one click on a later visit instead of playing on its own", async () => {
    window.localStorage.setItem(NIGHT_WIND_KEY, "on");
    render(<NightWindToggle createEngine={engine} />);
    const button = screen.getByRole("button", { name: "Night wind: tap to resume" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(FakeAudioContext.created).toHaveLength(0);
    await userEvent.click(button);
    expect(FakeAudioContext.created).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Night wind: on" })).toBeInTheDocument();
  });

  it("stays off when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<NightWindToggle createEngine={engine} />);
    expect(screen.getByRole("button", { name: "Night wind: off" })).toBeInTheDocument();
  });

  it("ducks on sleuth:media play and restores on pause", async () => {
    render(<NightWindToggle createEngine={engine} />);
    await userEvent.click(screen.getByRole("button", { name: "Night wind: off" }));
    media("play");
    expect(ctx().master().gain.lastRamp()?.value).toBe(0);
    media("pause");
    expect(ctx().master().gain.lastRamp()?.value).toBeCloseTo(0.6 * NIGHT_WIND_MAX_GAIN);
  });

  it("starts silent when the video is already playing", async () => {
    render(<NightWindToggle createEngine={engine} />);
    media("play");
    await userEvent.click(screen.getByRole("button", { name: "Night wind: off" }));
    expect(ctx().master().gain.lastRamp()?.value).toBe(0);
  });

  it("suspends when the tab is hidden and resumes when it is visible again", async () => {
    render(<NightWindToggle createEngine={engine} />);
    await userEvent.click(screen.getByRole("button", { name: "Night wind: off" }));
    setVisibility("hidden");
    expect(ctx().state).toBe("suspended");
    setVisibility("visible");
    expect(ctx().state).toBe("running");
  });
});

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api-client";
import { UploadFlow, uploadBytes } from "./upload-flow";

const video = (name = "demo.mp4", type = "video/mp4") => new File(["x"], name, { type });

const target = {
  assetVersion: {
    id: "av2",
    projectId: "p1",
    version: 2,
    storagePath: "p1/2/demo.mp4",
    mimeType: "video/mp4",
    durationMs: 52_000,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  uploadUrl: "fixture://no-upload/p1/2/demo.mp4",
  expiresAt: "2026-01-02T00:05:00.000Z",
};

function show(props: Partial<React.ComponentProps<typeof UploadFlow>> = {}) {
  const requestUploadUrl = vi.fn(async () => target);
  const onUploaded = vi.fn();
  render(
    <UploadFlow
      readOnly={false}
      requestUploadUrl={requestUploadUrl}
      onUploaded={onUploaded}
      readDuration={async () => 52_000}
      {...props}
    />,
  );
  return {
    requestUploadUrl,
    onUploaded,
    user: userEvent.setup({ applyAccept: false }),
    input: screen.getByLabelText("Choose a video file"),
  };
}

describe("UploadFlow", () => {
  it("states the MVP limits next to the file picker", () => {
    const { input } = show();
    expect(input).toHaveAccessibleDescription(
      "Limits: one English video, up to 180 seconds, and a plain-text script. A new video makes the evidence for the old one out of date.",
    );
  });

  it("refuses a 200-second video with the limit message and sends nothing", async () => {
    const { requestUploadUrl, user, input } = show({ readDuration: async () => 200_000 });
    await user.upload(input, video());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This video is 200 seconds long. The limit is 180 seconds. Trim it and try again.",
    );
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a video", async () => {
    const { requestUploadUrl, user, input } = show();
    await user.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This is not a video file. Choose a video.",
    );
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("requests an upload URL with the name, type and length read in the browser", async () => {
    const { requestUploadUrl, onUploaded, user, input } = show();
    await user.upload(input, video());
    expect(await screen.findByText("Video version 2 saved.")).toBeInTheDocument();
    expect(requestUploadUrl).toHaveBeenCalledWith({
      fileName: "demo.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1,
      durationMs: 52_000,
    });
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("says plainly that fixture mode does not upload the bytes", async () => {
    const { user, input } = show();
    await user.upload(input, video());
    expect(
      await screen.findByText(/Fixture mode has no storage, so the file was not sent anywhere/),
    ).toBeInTheDocument();
  });

  it("shows upload progress", async () => {
    let finish: () => void = () => undefined;
    const upload = vi.fn(
      (_url: string, _file: File, onProgress: (f: number) => void) =>
        new Promise<"uploaded">((resolve) => {
          onProgress(0.4);
          finish = () => resolve("uploaded");
        }),
    );
    const { user, input } = show({ upload });
    await user.upload(input, video());
    expect(await screen.findByText("Uploading: 40%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveAttribute(
      "value",
      "40",
    );
    finish();
    expect(await screen.findByText("Video version 2 saved.")).toBeInTheDocument();
  });

  it("shows what failed and retries with the same file", async () => {
    let fail = true;
    const requestUploadUrl = vi.fn(async () => {
      if (fail) throw new Error("Server down");
      return target;
    });
    const { user, input, onUploaded } = show({ requestUploadUrl });
    await user.upload(input, video("take-2.mp4"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Asking the server for an upload address failed.");
    expect(alert).toHaveTextContent("Server down");
    expect(alert).toHaveTextContent("Your script and checklist are not changed.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Video version 2 saved.")).toBeInTheDocument();
    expect(requestUploadUrl).toHaveBeenLastCalledWith({
      fileName: "take-2.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1,
      durationMs: 52_000,
    });
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("reports a failed byte upload separately from the URL request", async () => {
    const upload = vi.fn(async () => {
      throw new Error("The upload stopped. Check the connection and try again.");
    });
    const { user, input } = show({ upload });
    await user.upload(input, video());
    expect(await screen.findByRole("alert")).toHaveTextContent("Uploading the video failed.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("refuses a file over 50 MB before asking the server", async () => {
    const { requestUploadUrl, user, input } = show();
    const big = video();
    Object.defineProperty(big, "size", { value: 52_428_801 });
    await user.upload(input, big);
    expect(await screen.findByRole("alert")).toHaveTextContent("This file is over 50 MB.");
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a video type the server does not allow before asking the server", async () => {
    const { requestUploadUrl, user, input } = show();
    await user.upload(input, video("clip.flv", "video/x-flv"));
    expect(await screen.findByRole("alert")).toHaveTextContent("This video type is not allowed.");
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["video_too_large", "This file is over 50 MB."],
    ["invalid_size", "This file is over 50 MB."],
    ["video_too_long", "longer than 180 seconds"],
    [undefined, "This video type is not allowed."],
  ])("shows a clear message for a server 400 (%s) and starts no upload", async (reason, text) => {
    const requestUploadUrl = vi.fn(async () => {
      throw new ApiClientError(400, "invalid_request", "bad", reason ? { reason } : undefined);
    });
    const upload = vi.fn();
    const { user, input } = show({ requestUploadUrl, upload });
    await user.upload(input, video());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text);
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("has no file picker on the demo", () => {
    render(<UploadFlow readOnly requestUploadUrl={vi.fn()} onUploaded={vi.fn()} />);
    expect(screen.queryByLabelText("Choose a video file")).not.toBeInTheDocument();
    expect(screen.getByText(/The demo is read-only/)).toBeInTheDocument();
  });
});

describe("uploadBytes", () => {
  it("sends nothing for a fixture URL and reports full progress", async () => {
    const progress = vi.fn();
    const send = vi.spyOn(XMLHttpRequest.prototype, "send");
    await expect(uploadBytes("fixture://no-upload/x", video(), progress)).resolves.toBe(
      "skipped_in_fixture_mode",
    );
    expect(progress).toHaveBeenCalledWith(1);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
});

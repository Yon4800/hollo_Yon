import { describe, expect, it } from "vitest";

import { getFileExtension, resolveAudioInfo } from "./media";

describe("resolveAudioInfo", () => {
  it("resolves mp3 from MIME audio/mpeg", () => {
    const result = resolveAudioInfo("audio/mpeg", "test.mp3");
    expect(result.isAudio).toBe(true);
    expect(result.resolvedType).toBe("audio/mpeg");
    expect(result.extension).toBe("mp3");
  });

  it("resolves wav from MIME audio/wav", () => {
    const result = resolveAudioInfo("audio/wav", "sound.wav");
    expect(result.isAudio).toBe(true);
    expect(result.resolvedType).toBe("audio/wav");
    expect(result.extension).toBe("wav");
  });

  it("resolves midi from MIME audio/midi", () => {
    const result = resolveAudioInfo("audio/midi", "track.mid");
    expect(result.isAudio).toBe(true);
    expect(result.resolvedType).toBe("audio/midi");
    expect(result.extension).toBe("mid");
  });

  it("resolves midi from filename when MIME is generic octet-stream", () => {
    const result = resolveAudioInfo("application/octet-stream", "piano.mid");
    expect(result.isAudio).toBe(true);
    expect(result.resolvedType).toBe("audio/midi");
    expect(result.extension).toBe("mid");
  });

  it("resolves flac and ogg audio", () => {
    const flac = resolveAudioInfo("audio/flac", "audio.flac");
    expect(flac.isAudio).toBe(true);
    expect(flac.resolvedType).toBe("audio/flac");
    expect(flac.extension).toBe("flac");

    const ogg = resolveAudioInfo("audio/ogg", "audio.ogg");
    expect(ogg.isAudio).toBe(true);
    expect(ogg.resolvedType).toBe("audio/ogg");
    expect(ogg.extension).toBe("ogg");
  });

  it("returns isAudio false for image and video", () => {
    const image = resolveAudioInfo("image/png", "picture.png");
    expect(image.isAudio).toBe(false);

    const video = resolveAudioInfo("video/mp4", "movie.mp4");
    expect(video.isAudio).toBe(false);
  });
});

describe("getFileExtension", () => {
  it("extracts extension from filename", () => {
    expect(getFileExtension("song.mp3")).toBe("mp3");
    expect(getFileExtension("piano.MID")).toBe("mid");
    expect(getFileExtension("noextension")).toBeUndefined();
    expect(getFileExtension(undefined)).toBeUndefined();
  });
});

const CAPTION_SELECTORS = [
  ".ytp-caption-segment",
  ".ytp-caption-window-container",
  ".caption-window",
  ".vp-captions",
  ".vjs-text-track-display",
];

export function isCaptionTrack(track) {
  return track && (track.kind === "subtitles" || track.kind === "captions");
}

export function listCaptionTracks(video) {
  if (!video?.textTracks) {
    return [];
  }
  return [...video.textTracks].filter(isCaptionTrack);
}

export function activeCueText(track) {
  if (!track?.activeCues) {
    return "";
  }
  return [...track.activeCues]
    .map((cue) => cue.text)
    .filter(Boolean)
    .join("\n");
}

export function showingCaptionText(video) {
  for (const track of listCaptionTracks(video)) {
    if (track.mode === "showing") {
      const text = activeCueText(track);
      if (text) {
        return text;
      }
    }
  }
  return "";
}

export function pageCaptionText(root = document) {
  for (const selector of CAPTION_SELECTORS) {
    const nodes = root.querySelectorAll?.(selector);
    if (!nodes?.length) {
      continue;
    }
    const text = [...nodes]
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join("\n");
    if (text) {
      return text;
    }
  }
  return "";
}

export function captionFontScale(size) {
  switch (size) {
    case "small":
      return 0.8;
    case "large":
      return 1.35;
    default:
      return 1;
  }
}

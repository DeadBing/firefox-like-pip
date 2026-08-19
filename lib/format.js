/**
 * Format a media timestamp the way Firefox PiP does:
 * M:SS or H:MM:SS, with an optional live fallback.
 */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${minutes}:${pad(secs)}`;
}

export function formatTimestamp(currentTime, duration) {
  const live = !Number.isFinite(duration) || duration === Number.POSITIVE_INFINITY;
  if (live) {
    return `${formatClock(currentTime)} / LIVE`;
  }
  return `${formatClock(currentTime)} / ${formatClock(duration)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function progressRatio(currentTime, duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return clamp(currentTime / duration, 0, 1);
}

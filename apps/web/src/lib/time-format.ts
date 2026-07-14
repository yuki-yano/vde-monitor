export const formatDurationMs = (durationMs: number) => {
  if (durationMs <= 0) {
    return "0s";
  }
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return `${days}d${restHours > 0 ? ` ${restHours}h` : ""}${restMinutes > 0 ? ` ${restMinutes}m` : ""}`;
};

export const formatTime = (iso: string | null) => {
  if (!iso) {
    return "ongoing";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

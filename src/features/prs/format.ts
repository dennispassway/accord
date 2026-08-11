const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Formats an ISO date string (or Date) in Europe/Amsterdam, nl-NL. */
export function formatAmsterdam(date: string | Date): string {
  return dateTimeFormatter.format(
    typeof date === "string" ? new Date(date) : date,
  );
}

/**
 * Relatieve tijd zoals het design-script ("18 min", "2 u"): minuten onder
 * het uur, uren onder de dag, daarna dagen.
 */
export function formatRelative(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

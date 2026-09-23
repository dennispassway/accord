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

const WEEKDAG_KORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];

const hourMinuteFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

const dayPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kalenderdag (Amsterdam) als y/m/d-onderdelen én als dagnummer, zodat twee
 * instants zowel op dagniveau te vergelijken zijn als de weekdag/datum
 * eruit te lezen is, ongeacht het tijdstip op de dag (relevant rond
 * middernacht, waar de UTC-kalenderdag kan afwijken). */
function amsterdamDayParts(date: Date) {
  const parts = Object.fromEntries(
    dayPartsFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    dayNumber: Math.round(Date.UTC(year, month - 1, day) / 86_400_000),
    weekday: WEEKDAG_KORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
}

/**
 * Terugkeertijd van een snooze, in Europe/Amsterdam: "morgen 09:00" op de
 * dag erna, "vandaag 20:00" op dezelfde dag, een weekdag-afkorting binnen
 * de eerstvolgende week ("ma 09:00"), en anders "dd-mm HH:mm".
 */
export function formatSnoozeUntil(
  until: string,
  now: Date = new Date(),
): string {
  const untilDate = new Date(until);
  const time = hourMinuteFormatter.format(untilDate);
  const untilParts = amsterdamDayParts(untilDate);
  const dayDiff = untilParts.dayNumber - amsterdamDayParts(now).dayNumber;

  if (dayDiff === 0) return `vandaag ${time}`;
  if (dayDiff === 1) return `morgen ${time}`;
  if (dayDiff >= 2 && dayDiff <= 6) return `${untilParts.weekday} ${time}`;
  const day = String(untilParts.day).padStart(2, "0");
  const month = String(untilParts.month).padStart(2, "0");
  return `${day}-${month} ${time}`;
}

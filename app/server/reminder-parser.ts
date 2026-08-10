const monthNumbers: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export type ParsedReminder = {
  title: string;
  scheduledAt: string;
  note: string;
  confidence: number;
};

function setTime(date: Date, hours: number, minutes: number) {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function parseTime(text: string) {
  const match = text.match(/\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    if (match[3].toLowerCase().startsWith("p") && hours !== 12) hours += 12;
    if (match[3].toLowerCase().startsWith("a") && hours === 12) hours = 0;
    return { hours, minutes, found: true };
  }
  const military = text.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (military) {
    return { hours: Number(military[1]), minutes: Number(military[2]), found: true };
  }
  return { hours: 9, minutes: 0, found: false };
}

function parseDate(text: string, base: Date) {
  const lower = text.toLowerCase();
  const relative = lower.match(/\bin\s+(\d{1,3})\s+(minutes?|hours?|days?|weeks?)\b/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier = unit.startsWith("minute")
      ? 60_000
      : unit.startsWith("hour")
        ? 60 * 60_000
        : unit.startsWith("week")
          ? 7 * 24 * 60 * 60_000
          : 24 * 60 * 60_000;
    return {
      date: new Date(base.getTime() + amount * multiplier),
      found: true,
      exactTime: unit.startsWith("minute") || unit.startsWith("hour"),
    };
  }
  const relativeHours = lower.match(/\b(?:expires?|due)\s+in\s+(\d{1,3})\s+hours?\b/);
  if (relativeHours) {
    const date = new Date(base.getTime() + Number(relativeHours[1]) * 60 * 60 * 1000);
    return { date, found: true, exactTime: true };
  }
  if (/\btomorrow\b/.test(lower)) {
    const date = new Date(base);
    date.setDate(date.getDate() + 1);
    return { date, found: true, exactTime: false };
  }
  if (/\btoday\b/.test(lower)) return { date: new Date(base), found: true, exactTime: false };

  const iso = text.match(/\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    return {
      date: new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])),
      found: true,
      exactTime: false,
    };
  }

  const numeric = text.match(/\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])(?:[\/-](\d{2,4}))?\b/);
  if (numeric) {
    let year = numeric[3] ? Number(numeric[3]) : base.getFullYear();
    if (year < 100) year += 2000;
    return {
      date: new Date(year, Number(numeric[1]) - 1, Number(numeric[2])),
      found: true,
      exactTime: false,
    };
  }

  const named = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
  );
  if (named) {
    return {
      date: new Date(
        Number(named[3] ?? base.getFullYear()),
        monthNumbers[named[1].toLowerCase()],
        Number(named[2]),
      ),
      found: true,
      exactTime: false,
    };
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayIndex = weekdays.findIndex((day) => new RegExp(`\\b(?:next\\s+)?${day}\\b`, "i").test(text));
  if (weekdayIndex >= 0) {
    const date = new Date(base);
    let delta = (weekdayIndex - date.getDay() + 7) % 7;
    if (delta === 0 || new RegExp(`\\bnext\\s+${weekdays[weekdayIndex]}\\b`, "i").test(text)) delta += 7;
    date.setDate(date.getDate() + delta);
    return { date, found: true, exactTime: false };
  }
  return { date: new Date(base), found: false, exactTime: false };
}

function cleanTitle(text: string) {
  return text
    .replace(/^\s*(re|fw|fwd):\s*/gi, "")
    .replace(/^\s*remind me (?:to|about)\s+/i, "")
    .replace(/^\s*(?:add|put)\s+/i, "")
    .replace(/\s+(?:today|tomorrow|next\s+\w+)(?:\s+at\s+.*)?$/i, "")
    .trim()
    .slice(0, 140);
}

export function parseReminderText(
  text: string,
  options?: { subject?: string; baseDate?: Date; note?: string },
): ParsedReminder | null {
  const source = `${options?.subject ?? ""} ${text}`.trim();
  if (!source) return null;
  const base = options?.baseDate && !Number.isNaN(options.baseDate.getTime())
    ? options.baseDate
    : new Date();
  const parsedDate = parseDate(source, base);
  const parsedTime = parseTime(source);
  const strongSignal = /\b(remind|meeting|appointment|reservation|check[ -]?in|check[ -]?out|due|deadline|event|interview|flight|pickup|call|visit|payment|renew|submit|return|follow[ -]?up|delivery|booking|conference)\b/i.test(source);
  const weakSignal = /\b(expires?|schedule|date|time)\b/i.test(source);
  const lowValueMessage = /\b(posted (?:a|an|their) (?:story|photo|video)|social update|newsletter|daily digest|weekly digest|report subscription|subscription report|unsubscribe|promotional?|sale ends|recommended for you|results? for\b)/i.test(source);
  const signal = strongSignal || weakSignal;

  // Social, marketing, and subscription messages often contain dates or expiry
  // language but are rarely useful reminders. A strong action signal can still
  // override this filter for a real reservation, appointment, or deadline.
  if (lowValueMessage && !strongSignal) return null;

  if (!parsedDate.found && !parsedTime.found) return null;
  if (!signal && !(parsedDate.found && parsedTime.found)) return null;

  let scheduled = parsedDate.date;
  if (!parsedDate.exactTime) {
    scheduled = setTime(parsedDate.date, parsedTime.hours, parsedTime.minutes);
  }
  if (scheduled.getTime() < base.getTime() - 12 * 60 * 60 * 1000 && !/\b(today|tomorrow)\b/i.test(source)) {
    scheduled.setFullYear(scheduled.getFullYear() + 1);
  }

  const subject = options?.subject?.trim();
  const title = cleanTitle(subject || text) || "New reminder";
  let confidence = parsedDate.found && (parsedTime.found || parsedDate.exactTime) ? 94 : 78;
  if (strongSignal) confidence += 2;
  if (!signal) confidence -= 10;
  confidence = Math.max(55, Math.min(98, confidence));
  return {
    title,
    scheduledAt: scheduled.toISOString(),
    note: (options?.note || text).trim().slice(0, 1200),
    confidence,
  };
}

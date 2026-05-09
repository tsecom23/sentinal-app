function getAmsterdamDate(offsetDays = 0) {
  const date = new Date();

  date.setDate(date.getDate() + offsetDays);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDateFilter(url: URL) {
  const range = url.searchParams.get("range") || "30d";

  if (range === "today") {
    const today = getAmsterdamDate(0);
    return { start: today, end: today };
  }

  if (range === "yesterday") {
    const yesterday = getAmsterdamDate(-1);
    return { start: yesterday, end: yesterday };
  }

  const end = getAmsterdamDate(0);
  const start = getAmsterdamDate(-29);

  return { start, end };
}
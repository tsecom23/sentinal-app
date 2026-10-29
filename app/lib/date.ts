// Dashboard days follow Dutch time (Europe/Amsterdam), regardless of where the
// browser is — orders are stored with the shop's +01:00/+02:00 offset, so "today"
// must be the Amsterdam calendar day, not the UTC or local (e.g. Bali) one.
export const DASHBOARD_TZ = "Europe/Amsterdam";

// YYYY-MM-DD of the Amsterdam calendar day, shifted by offsetDays.
export function nlDate(offsetDays = 0): string {
  const base = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!offsetDays) return base;
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

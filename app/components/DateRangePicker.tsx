"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface DateRange { start: string; end: string; preset: string; }

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
export function today() { return daysAgo(0); }

// ── date-string helpers — all UTC so parse + format stay consistent ──
// (parsing as local midnight but formatting via toISOString shifts the date
//  by a day in non-UTC timezones, which made ◀ jump 2 days and ▶ do nothing).
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function initRange(preset: string): DateRange {
  const t = today();
  if (preset === "today")     return { start: t,           end: t,           preset };
  if (preset === "yesterday") return { start: daysAgo(1),  end: daysAgo(1),  preset };
  if (preset === "7d")        return { start: daysAgo(6),  end: t,           preset };
  if (preset === "30d")       return { start: daysAgo(29), end: t,           preset };
  if (preset === "90d")       return { start: daysAgo(89), end: t,           preset };
  return { start: daysAgo(29), end: t, preset: "30d" };
}

export function toQueryString(r: DateRange) {
  return `start=${r.start}&end=${r.end}`;
}

const PRESETS = [
  { label: "Today",     key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "7d",        key: "7d" },
  { label: "30d",       key: "30d" },
  { label: "90d",       key: "90d" },
];

// Human label for the current selection (used for the single-day pill).
function singleDayLabel(iso: string): string {
  const t = today();
  if (iso === t)             return "Today";
  if (iso === addDays(t, -1)) return "Yesterday";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  const t = today();
  const singleDay = value.start === value.end;
  const atToday   = singleDay && value.end >= t;

  function applyPreset(key: string) {
    onChange(initRange(key));
  }
  function setStart(s: string) {
    if (s) onChange({ ...value, start: s, end: value.end < s ? s : value.end, preset: "custom" });
  }
  function setEnd(e: string) {
    if (e) onChange({ ...value, end: e, preset: "custom" });
  }

  // One button = the day before, one button = the day after. Always lands on a
  // single day and steps exactly one day (cursor = most recent day in view).
  function stepDay(dir: -1 | 1) {
    let d = addDays(value.end, dir);
    if (d > t) d = t;                    // never step past today
    onChange({ start: d, end: d, preset: "day" });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Quick presets */}
      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              value.preset === p.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Day stepper — walk back/forward one window at a time */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => stepDay(-1)}
          title="Previous day"
          aria-label="Previous day"
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm transition-all"
        >
          <ChevronLeft size={14} />
        </button>
        {singleDay && (
          <span className="px-2 text-xs font-medium text-gray-700 tabular-nums select-none min-w-[92px] text-center">
            {singleDayLabel(value.start)}
          </span>
        )}
        <button
          onClick={() => stepDay(1)}
          disabled={atToday}
          title="Next day"
          aria-label="Next day"
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none disabled:cursor-not-allowed"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Custom date inputs */}
      <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 border transition-all ${
        value.preset === "custom" || value.preset === "day"
          ? "bg-blue-50 border-blue-200"
          : "bg-gray-100 border-transparent"
      }`}>
        <input
          type="date"
          value={value.start}
          max={value.end}
          onChange={e => setStart(e.target.value)}
          className="bg-transparent text-xs text-gray-700 outline-none w-[110px] [color-scheme:light] cursor-pointer"
        />
        <span className="text-gray-300 text-xs select-none">→</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={today()}
          onChange={e => setEnd(e.target.value)}
          className="bg-transparent text-xs text-gray-700 outline-none w-[110px] [color-scheme:light] cursor-pointer"
        />
      </div>
    </div>
  );
}

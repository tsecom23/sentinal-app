"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface DateRange { start: string; end: string; preset: string; }

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
export function today() { return daysAgo(0); }

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

  function applyPreset(key: string) { onChange(initRange(key)); }
  function setStart(s: string) {
    if (s) onChange({ ...value, start: s, end: value.end < s ? s : value.end, preset: "custom" });
  }
  function setEnd(e: string) {
    if (e) onChange({ ...value, end: e, preset: "custom" });
  }
  function stepDay(dir: -1 | 1) {
    let d = addDays(value.end, dir);
    if (d > t) d = t;
    onChange({ start: d, end: d, preset: "day" });
  }

  const isCustom = value.preset === "custom" || value.preset === "day";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Quick presets */}
      <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className="px-2.5 py-1.5 rounded-md text-[11px] font-mono font-medium transition-all"
            style={value.preset === p.key ? {
              background: "rgba(34,211,238,0.12)",
              color: "#22d3ee",
              border: "1px solid rgba(34,211,238,0.2)",
            } : {
              color: "#71717a",
              border: "1px solid transparent",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Day stepper */}
      <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => stepDay(-1)}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all"
        >
          <ChevronLeft size={13} />
        </button>
        {singleDay && (
          <span className="px-2 text-[11px] font-mono text-zinc-400 tabular-nums select-none min-w-[88px] text-center">
            {singleDayLabel(value.start)}
          </span>
        )}
        <button
          onClick={() => stepDay(1)}
          disabled={atToday}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Custom date range */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all"
        style={isCustom ? {
          background: "rgba(34,211,238,0.08)",
          border: "1px solid rgba(34,211,238,0.2)",
        } : {
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <input
          type="date"
          value={value.start}
          max={value.end}
          onChange={e => setStart(e.target.value)}
          className="bg-transparent text-[11px] font-mono text-zinc-400 outline-none w-[100px] cursor-pointer"
          style={{ colorScheme: "dark" }}
        />
        <span className="text-zinc-700 text-xs select-none font-mono">→</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={today()}
          onChange={e => setEnd(e.target.value)}
          className="bg-transparent text-[11px] font-mono text-zinc-400 outline-none w-[100px] cursor-pointer"
          style={{ colorScheme: "dark" }}
        />
      </div>
    </div>
  );
}

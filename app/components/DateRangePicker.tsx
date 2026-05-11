"use client";

export interface DateRange { start: string; end: string; preset: string; }

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
export function today() { return daysAgo(0); }

export function initRange(preset: string): DateRange {
  const t = today();
  if (preset === "today")     return { start: t,          end: t,          preset };
  if (preset === "yesterday") return { start: daysAgo(1), end: daysAgo(1), preset };
  if (preset === "7d")        return { start: daysAgo(6), end: t,          preset };
  if (preset === "30d")       return { start: daysAgo(29), end: t,         preset };
  if (preset === "90d")       return { start: daysAgo(89), end: t,         preset };
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

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  function applyPreset(key: string) {
    onChange(initRange(key));
  }
  function setStart(s: string) {
    if (s) onChange({ ...value, start: s, preset: "custom" });
  }
  function setEnd(e: string) {
    if (e) onChange({ ...value, end: e, preset: "custom" });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Quick presets */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              value.preset === p.key
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 border transition-all ${
        value.preset === "custom"
          ? "bg-blue-600/15 border-blue-500/40"
          : "bg-white/5 border-white/8"
      }`}>
        <input
          type="date"
          value={value.start}
          max={value.end}
          onChange={e => setStart(e.target.value)}
          className="bg-transparent text-xs text-white outline-none w-[110px] [color-scheme:dark] cursor-pointer"
        />
        <span className="text-zinc-600 text-xs select-none">→</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={today()}
          onChange={e => setEnd(e.target.value)}
          className="bg-transparent text-xs text-white outline-none w-[110px] [color-scheme:dark] cursor-pointer"
        />
      </div>
    </div>
  );
}

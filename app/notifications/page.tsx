"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

const STORES = [
  { key: "ceofo",     name: "CEOFO"     },
  { key: "martaline", name: "Martaline" },
];

const API = "https://sentinel-api.tssheets1.workers.dev";

interface NotificationSettings {
  store_id:             string;
  slack_webhook:        string;
  whatsapp_phone:       string;
  notify_milestones:    0 | 1;
  notify_kill_signals:  0 | 1;
  notify_cs_urgent:     0 | 1;
  notify_daily_digest:  0 | 1;
}

function Toggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={disabled ? undefined : onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex items-center ${
        disabled
          ? "opacity-40 cursor-not-allowed bg-zinc-700"
          : on
          ? "bg-blue-600 cursor-pointer"
          : "bg-zinc-700 cursor-pointer"
      }`}
    >
      <span
        className={`absolute w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </div>
  );
}

export default function NotificationsPage() {
  const [storeId, setStoreId] = useState(STORES[0].key);
  const [settings, setSettings] = useState<NotificationSettings>({
    store_id:            STORES[0].key,
    slack_webhook:       "",
    whatsapp_phone:      "",
    notify_milestones:   0,
    notify_kill_signals: 0,
    notify_cs_urgent:    0,
    notify_daily_digest: 0,
  });
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [savedOk, setSavedOk]       = useState(false);

  const [slackTest, setSlackTest]   = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [waTest,    setWaTest]      = useState<"idle" | "loading" | "ok" | "fail">("idle");

  // Fetch settings whenever store changes
  useEffect(() => {
    setLoading(true);
    setSlackTest("idle");
    setWaTest("idle");
    fetch(`${API}/api/notifications/settings?store_id=${storeId}`)
      .then((r) => r.json())
      .then((data: NotificationSettings) => {
        setSettings({ ...data, store_id: storeId });
      })
      .catch(() => {
        // If fetch fails, reset to defaults for this store
        setSettings({
          store_id:            storeId,
          slack_webhook:       "",
          whatsapp_phone:      "",
          notify_milestones:   0,
          notify_kill_signals: 0,
          notify_cs_urgent:    0,
          notify_daily_digest: 0,
        });
      })
      .finally(() => setLoading(false));
  }, [storeId]);

  function patch(partial: Partial<NotificationSettings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function toggleBit(field: keyof Pick<NotificationSettings, "notify_milestones" | "notify_kill_signals" | "notify_cs_urgent" | "notify_daily_digest">) {
    setSettings((prev) => ({ ...prev, [field]: prev[field] === 1 ? 0 : 1 }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`${API}/api/notifications/settings`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(settings),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch {
      // silent — could add error toast here
    } finally {
      setSaving(false);
    }
  }

  async function testSlack() {
    setSlackTest("loading");
    try {
      const res = await fetch(`${API}/api/notifications/test`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ slack_webhook: settings.slack_webhook }),
      });
      setSlackTest(res.ok ? "ok" : "fail");
    } catch {
      setSlackTest("fail");
    }
  }

  async function testWhatsApp() {
    setWaTest("loading");
    try {
      const res = await fetch(`${API}/api/notifications/test`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ whatsapp_phone: settings.whatsapp_phone }),
      });
      setWaTest(res.ok ? "ok" : "fail");
    } catch {
      setWaTest("fail");
    }
  }

  const testLabel = (state: "idle" | "loading" | "ok" | "fail") => {
    if (state === "loading") return "Sending…";
    if (state === "ok")      return "✅ Sent!";
    if (state === "fail")    return "❌ Failed";
    return "Test";
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900 p-8">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Bell size={22} className="text-yellow-400" />
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Configure Slack and WhatsApp alerts for key events
          </p>
        </div>

        {/* ── Store selector ── */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Store:</span>
          <div className="flex gap-2">
            {STORES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStoreId(s.key)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  storeId === s.key
                    ? "bg-blue-600 text-gray-900"
                    : "bg-black/5 text-gray-500 hover:bg-black/10 hover:text-gray-900"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading settings…</p>
        ) : (
          <>
            {/* ── Channel cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Slack card */}
              <div className="bg-[#4A154B]/20 border border-[#4A154B]/40 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <span className="font-semibold text-gray-900">Slack</span>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="url"
                    value={settings.slack_webhook}
                    onChange={(e) => patch({ slack_webhook: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-zinc-600 focus:outline-none focus:border-[#4A154B]/80 transition-colors"
                  />
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Create an Incoming Webhook in your Slack workspace settings
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={testSlack}
                    disabled={!settings.slack_webhook || slackTest === "loading"}
                    className="px-4 py-1.5 rounded-xl bg-[#4A154B]/60 border border-[#4A154B]/60 text-sm font-medium text-gray-900 hover:bg-[#4A154B]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {slackTest === "loading" ? "Sending…" : "Test"}
                  </button>
                  {slackTest !== "idle" && slackTest !== "loading" && (
                    <span
                      className={`text-sm font-medium ${
                        slackTest === "ok" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {testLabel(slackTest)}
                    </span>
                  )}
                </div>
              </div>

              {/* WhatsApp card */}
              <div className="bg-[#075E54]/20 border border-[#075E54]/40 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📱</span>
                  <span className="font-semibold text-gray-900">WhatsApp</span>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="tel"
                    value={settings.whatsapp_phone}
                    onChange={(e) => patch({ whatsapp_phone: e.target.value })}
                    placeholder="+31612345678"
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-zinc-600 focus:outline-none focus:border-[#075E54]/80 transition-colors"
                  />
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Uses CallMeBot — first send &ldquo;I allow callmebot to send me messages&rdquo; to
                    +34 644 79 74 14 on WhatsApp to activate
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={testWhatsApp}
                    disabled={!settings.whatsapp_phone || waTest === "loading"}
                    className="px-4 py-1.5 rounded-xl bg-[#075E54]/60 border border-[#075E54]/60 text-sm font-medium text-gray-900 hover:bg-[#075E54]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {waTest === "loading" ? "Sending…" : "Test"}
                  </button>
                  {waTest !== "idle" && waTest !== "loading" && (
                    <span
                      className={`text-sm font-medium ${
                        waTest === "ok" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {testLabel(waTest)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Alert events ── */}
            <div className="bg-white/[0.03] border border-black/8 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Alert events</h2>

              <div className="space-y-3">
                {/* Milestones */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <span>🏆</span> Product milestones
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Product reaches 5 / 20 / 40 sales
                    </p>
                  </div>
                  <Toggle
                    on={settings.notify_milestones === 1}
                    onToggle={() => toggleBit("notify_milestones")}
                  />
                </div>

                <div className="border-t border-black/5" />

                {/* Kill signals */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <span>🔴</span> Kill signals
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Product spending budget with no orders
                    </p>
                  </div>
                  <Toggle
                    on={settings.notify_kill_signals === 1}
                    onToggle={() => toggleBit("notify_kill_signals")}
                  />
                </div>

                <div className="border-t border-black/5" />

                {/* CS urgent */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <span>🆘</span> Urgent CS tickets
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      CS ticket marked as urgent
                    </p>
                  </div>
                  <Toggle
                    on={settings.notify_cs_urgent === 1}
                    onToggle={() => toggleBit("notify_cs_urgent")}
                  />
                </div>

                <div className="border-t border-black/5" />

                {/* Daily digest — disabled / coming soon */}
                <div className="flex items-center justify-between opacity-60">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <span>📊</span> Daily digest
                      <span className="ml-1 text-[10px] font-semibold bg-zinc-700 text-gray-600 px-2 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Morning summary of your store performance
                    </p>
                  </div>
                  <Toggle
                    on={settings.notify_daily_digest === 1}
                    disabled
                    onToggle={() => {}}
                  />
                </div>
              </div>
            </div>

            {/* ── Save button ── */}
            <div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-semibold text-sm transition-all"
              >
                {savedOk ? "Saved ✓" : saving ? "Saving…" : "Save settings"}
              </button>
            </div>

            {/* ── Info box ── */}
            <div className="bg-blue-50 border border-blue-500/20 rounded-2xl p-4 text-[13px] text-gray-500 leading-relaxed space-y-1.5">
              <p className="text-blue-700 font-semibold text-sm">How notifications work</p>
              <p>
                TSecom checks your store data every few minutes. When a configured event is
                detected — such as a product hitting a sales milestone or a kill signal being
                triggered — an alert is sent to your configured channels instantly.
              </p>
              <p>
                You can configure different webhooks per store. WhatsApp alerts use the
                CallMeBot free API. Slack alerts use Incoming Webhooks — no Slack app
                installation required.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

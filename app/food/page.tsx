"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";

type FoodEntry = {
  id: string;
  log_date: string;
  breakfast: string | null;
  brunch: string | null;
  lunch: string | null;
  merienda: string | null;
  dinner: string | null;
  extra: string | null;
};

const MEALS: { key: keyof Omit<FoodEntry, "id" | "log_date">; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "brunch", label: "Brunch" },
  { key: "lunch", label: "Lunch" },
  { key: "merienda", label: "Merienda" },
  { key: "dinner", label: "Dinner" },
  { key: "extra", label: "Extra & notes" },
];

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function formatDow(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-PH", { weekday: "long" });
}

export default function FoodLogPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", uid)
      .order("log_date", { ascending: false })
      .limit(30);
    setEntries(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function addToday() {
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];
    const exists = entries.find((e) => e.log_date === today);
    if (exists) return;
    const { data } = await supabase
      .from("food_entries")
      .insert({ user_id: userId, log_date: today })
      .select()
      .single();
    if (data) setEntries((prev) => [data, ...prev]);
  }

  async function updateCell(
    entry: FoodEntry,
    field: keyof Omit<FoodEntry, "id" | "log_date">,
    value: string
  ) {
    setSaving(entry.id + field);
    await supabase
      .from("food_entries")
      .update({ [field]: value || null })
      .eq("id", entry.id);
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, [field]: value || null } : e))
    );
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-5 py-10">
        <p className="text-inksoft">Loading food log...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display text-xl font-semibold">Ipon</span>
        <span className="text-xs text-inksoft">your cutoff, tracked</span>
      </div>
      <NavTabs />

      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-semibold">Food log</h1>
        <button onClick={addToday} className="bg-jade text-paperraised font-semibold rounded-xl px-4 py-2 text-sm">
          + Add today
        </button>
      </div>
      <p className="text-inksoft text-sm mb-5">
        Click any cell to edit. Nothing's required — leave a meal blank on days you skip it.
      </p>

      {entries.length === 0 && (
        <div className="border border-dashed border-line rounded-card p-10 text-center">
          <p className="text-inksoft text-sm mb-4">No food entries yet.</p>
          <button onClick={addToday} className="bg-jade text-paperraised font-semibold rounded-xl px-5 py-2.5 text-sm">
            Start today's log
          </button>
        </div>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto border border-line rounded-card bg-paperraised">
          <table className="border-collapse w-full" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th className="text-left text-xs font-bold text-jadedeep uppercase tracking-widest px-4 py-3 bg-sage whitespace-nowrap"
                  style={{ minWidth: 96 }}>Date</th>
                {MEALS.map((m) => (
                  <th key={m.key}
                    className="text-left text-xs font-bold text-jadedeep uppercase tracking-widest px-4 py-3 bg-sage whitespace-nowrap"
                    style={{ minWidth: m.key === "extra" ? 170 : 130 }}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 border-b border-r border-line bg-paper font-bold text-sm whitespace-nowrap align-top">
                    {formatDate(entry.log_date)}
                    <span className="block text-xs text-inksoft font-normal mt-0.5">{formatDow(entry.log_date)}</span>
                  </td>
                  {MEALS.map((m) => (
                    <td key={m.key} className="border-b border-r border-line last:border-r-0 align-top p-0">
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="—"
                        onBlur={(e) => updateCell(entry, m.key, e.currentTarget.textContent ?? "")}
                        className={`px-3 py-3 text-sm outline-none min-h-[44px] focus:bg-sage focus:shadow-inner
                          ${m.key === "extra" ? "text-inksoft italic text-xs" : ""}
                          ${saving === entry.id + m.key ? "opacity-50" : ""}
                          empty:before:content-[attr(data-placeholder)] empty:before:text-inksoft/40`}
                      >
                        {entry[m.key] ?? ""}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

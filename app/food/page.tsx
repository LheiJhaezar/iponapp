"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";
import Link from "next/link";

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
    if (!uid) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", uid)
      .order("log_date", { ascending: false })
      .limit(30);
    setEntries(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

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
        <p className="text-gray-500 text-sm font-medium">Loading food log...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Top Header Navigation */}
      <NavTabs />

      {/* Secondary Sub-Navigation Pills */}
      <div className="flex gap-2 my-4">
        <Link
          href="/bills"
          className="px-5 py-1.5 rounded-full bg-transparent text-gray-700 hover:text-gray-900 text-xs font-medium transition-colors"
        >
          Bills
        </Link>
        <Link
          href="/food"
          className="px-5 py-1.5 rounded-full bg-[#1b4332] text-white text-xs font-semibold shadow-sm"
        >
          Food log
        </Link>
      </div>

      {/* Page Title & Add Button */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Food log</h1>
          <p className="text-gray-500 text-xs mt-1">
            Click any cell to edit. Nothing's required — leave a meal blank on days you skip it.
          </p>
        </div>
        <button
          onClick={addToday}
          className="bg-[#1b4332] text-white font-semibold rounded-lg px-4 py-2 text-xs hover:bg-[#2d6a4f] transition-colors shadow-sm"
        >
          + Add today
        </button>
      </div>

      {/* Empty State */}
      {entries.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-2xl p-10 text-center bg-white my-6">
          <p className="text-gray-500 text-sm mb-4">No food entries yet.</p>
          <button
            onClick={addToday}
            className="bg-[#1b4332] text-white font-semibold rounded-xl px-5 py-2.5 text-xs hover:bg-[#2d6a4f] transition-colors shadow-sm"
          >
            Start today's log
          </button>
        </div>
      )}

      {/* Editable Food Table */}
      {entries.length > 0 && (
        <div className="mt-6 overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="border-collapse w-full" style={{ minWidth: 820 }}>
            <thead>
              <tr className="bg-[#e8f5e9]/60 border-b border-gray-200">
                <th
                  className="text-left text-xs font-bold text-[#1b4332] uppercase tracking-wider px-4 py-3 whitespace-nowrap"
                  style={{ minWidth: 100 }}
                >
                  Date
                </th>
                {MEALS.map((m) => (
                  <th
                    key={m.key}
                    className="text-left text-xs font-bold text-[#1b4332] uppercase tracking-wider px-4 py-3 whitespace-nowrap"
                    style={{ minWidth: m.key === "extra" ? 170 : 130 }}
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 border-r border-gray-200 bg-gray-50/30 font-semibold text-sm text-gray-900 whitespace-nowrap align-top">
                    {formatDate(entry.log_date)}
                    <span className="block text-[11px] text-gray-400 font-normal mt-0.5">
                      {formatDow(entry.log_date)}
                    </span>
                  </td>
                  {MEALS.map((m) => (
                    <td
                      key={m.key}
                      className="border-r border-gray-200 last:border-r-0 align-top p-0"
                    >
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="—"
                        onBlur={(e) => updateCell(entry, m.key, e.currentTarget.textContent ?? "")}
                        className={`px-3 py-3 text-sm outline-none min-h-[48px] focus:bg-[#e8f5e9]/40 transition-colors
                          ${m.key === "extra" ? "text-gray-500 italic text-xs" : "text-gray-800"}
                          ${saving === entry.id + m.key ? "opacity-50" : ""}
                          empty:before:content-[attr(data-placeholder)] empty:before:text-gray-300`}
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
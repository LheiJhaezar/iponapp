"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";
import Link from "next/link";

type DueSchedule = "end_of_month" | "specific_days" | "per_cutoff" | "custom_date";

type Bill = {
  id: string;
  name: string;
  category: string;
  expected_amount: number;
  due_schedule: DueSchedule;
  due_days: number[] | null;
  due_custom_date: string | null;
  shared: boolean;
  icon: string;
  active: boolean;
};

const SCHEDULES: { key: DueSchedule; icon: string; label: string; sub: string }[] = [
  { key: "end_of_month", icon: "📅", label: "End of month", sub: "Always last day" },
  { key: "specific_days", icon: "🗓", label: "Specific day(s)", sub: "e.g. 10th, 15th" },
  { key: "per_cutoff", icon: "✂️", label: "Per cutoff", sub: "15th & 30th" },
  { key: "custom_date", icon: "✏️", label: "Custom date", sub: "Pick exact date" },
];

// Horizontal calendar ribbon mock data
const DATE_RIBBON = [
  { day: 17, month: "Oct", isSelected: false, hasDot: false },
  { day: 18, month: "Oct", isSelected: false, hasDot: false },
  { day: 19, month: "Oct", isSelected: false, hasDot: false },
  { day: 20, month: "Oct", isSelected: false, hasDot: false },
  { day: 21, month: "Oct", isSelected: false, hasDot: false },
  { day: 22, month: "Oct", isSelected: true, hasDot: true },
  { day: 23, month: "Oct", isSelected: false, hasDot: false },
  { day: 24, month: "Oct", isSelected: false, hasDot: false },
  { day: 25, month: "Oct", isSelected: true, hasDot: true },
  { day: 26, month: "Oct", isSelected: false, hasDot: false },
  { day: 27, month: "Oct", isSelected: false, hasDot: false },
  { day: 28, month: "Oct", isSelected: true, hasDot: true },
  { day: 29, month: "Oct", isSelected: false, hasDot: false },
];

function getDueLabel(bill: Bill): string {
  switch (bill.due_schedule) {
    case "end_of_month":
      return "End of month";
    case "per_cutoff":
      return "Every 15th & 30th";
    case "specific_days":
      if (!bill.due_days?.length) return "Specific days";
      return `Every ${bill.due_days.map((d) => `${d}th`).join(", ")}`;
    case "custom_date":
      return bill.due_custom_date ? `Due ${bill.due_custom_date}` : "Custom date";
    default:
      return "";
  }
}

function getDaysUntilDue(bill: Bill): number | null {
  const today = new Date();
  const todayDay = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  if (bill.due_schedule === "end_of_month") {
    return daysInMonth - todayDay;
  }
  if (bill.due_schedule === "per_cutoff") {
    const next = todayDay <= 15 ? 15 : 30;
    return next - todayDay;
  }
  if (bill.due_schedule === "specific_days" && bill.due_days?.length) {
    const upcoming = bill.due_days
      .map((d) => (d >= todayDay ? d - todayDay : daysInMonth - todayDay + d))
      .sort((a, b) => a - b);
    return upcoming[0] ?? null;
  }
  if (bill.due_schedule === "custom_date" && bill.due_custom_date) {
    const due = new Date(bill.due_custom_date);
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    return diff;
  }
  return null;
}

export default function BillsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editScope, setEditScope] = useState<"once" | "forward">("once");

  // Add bill form state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Utilities");
  const [schedule, setSchedule] = useState<DueSchedule>("end_of_month");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [customDate, setCustomDate] = useState("");
  const [shared, setShared] = useState(true);
  const [billNotes, setBillNotes] = useState("");

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
      .from("recurring_bills")
      .select("*")
      .eq("user_id", uid)
      .eq("active", true)
      .order("created_at", { ascending: false });
    setBills(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleDay(d: number) {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function resetForm() {
    setName("");
    setAmount("");
    setCategory("Utilities");
    setSchedule("end_of_month");
    setSelectedDays([]);
    setCustomDate("");
    setShared(true);
    setBillNotes("");
  }

  async function handleAddBill(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !name || !amount) return;
    await supabase.from("recurring_bills").insert({
      user_id: userId,
      name,
      category,
      expected_amount: Number(amount),
      due_schedule: schedule,
      due_days: schedule === "specific_days" ? selectedDays : null,
      due_custom_date: schedule === "custom_date" ? customDate : null,
      shared,
      note: billNotes || null,
    });
    resetForm();
    setShowDrawer(false);
    load();
  }

  async function handleSaveEdit() {
    if (!editingBill || !userId) return;
    const newAmount = Number(editAmount);
    if (editScope === "forward") {
      await supabase.from("recurring_bills").update({ expected_amount: newAmount }).eq("id", editingBill.id);
    } else {
      const { data: cutoffs } = await supabase
        .from("cutoffs")
        .select("id")
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
        .limit(1);
      const cid = cutoffs?.[0]?.id;
      if (cid) {
        await supabase.from("allocations").insert({
          user_id: userId,
          cutoff_id: cid,
          category: "bills",
          amount: newAmount,
          bill_id: editingBill.id,
          shared: editingBill.shared,
          note: `${editingBill.name} — adjusted`,
        });
      }
    }
    setEditingBill(null);
    load();
  }

  const sorted = [...bills].sort((a, b) => {
    const da = getDaysUntilDue(a) ?? 999;
    const db = getDaysUntilDue(b) ?? 999;
    return da - db;
  });

  const dueSoon = sorted.filter((b) => {
    const d = getDaysUntilDue(b);
    return d !== null && d <= 7;
  });

  const allBills = sorted;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <p className="text-gray-500 text-sm font-medium">Loading bills...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      {/* Main Top Nav */}
      <NavTabs />

      {/* Secondary Bills / Food Toggle */}
      <div className="flex gap-2 my-4">
        <Link
          href="/bills"
          className="px-5 py-1.5 rounded-full bg-[#1b4332] text-white text-xs font-semibold shadow-sm"
        >
          Bills
        </Link>
        <Link
          href="/food"
          className="px-5 py-1.5 rounded-full bg-transparent text-gray-700 hover:text-gray-900 text-xs font-medium transition-colors"
        >
          Food log
        </Link>
      </div>

      {/* Section Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Bills &amp; dues</h1>
          <p className="text-gray-500 text-xs mt-1">
            Set your own due date per bill — end of month, every 15th, specific days, whatever matches.
          </p>
        </div>
        <button
          onClick={() => setShowDrawer(true)}
          className="bg-[#1b4332] text-white font-semibold rounded-lg px-4 py-2 text-xs hover:bg-[#2d6a4f] transition-colors shadow-sm"
        >
          + Add bill
        </button>
      </div>

      {/* Calendar Strip */}
      <div className="my-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {DATE_RIBBON.map((d, index) => (
            <div
              key={index}
              className={`flex-shrink-0 w-12 h-16 rounded-xl border flex flex-col items-center justify-between py-2 transition-all ${
                d.isSelected
                  ? "border-[#1b4332] bg-[#e8f5e9]/60 font-bold"
                  : "border-gray-200 bg-white"
              }`}
            >
              <span className="text-xs font-bold text-gray-800">{d.day}</span>
              <span className="text-[10px] text-gray-400">{d.month}</span>
              {d.hasDot ? (
                <div className="w-1.5 h-1.5 rounded-full bg-[#1b4332]" />
              ) : (
                <div className="w-1.5 h-1.5" />
              )}
            </div>
          ))}
        </div>
        <div className="w-full bg-gray-200 h-1 rounded-full mt-1 relative">
          <div className="bg-gray-400 h-1 rounded-full w-1/3 mx-auto" />
        </div>
      </div>

      {/* DUE SOON SECTION */}
      {dueSoon.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            DUE SOON
          </p>
          <div className="flex flex-col gap-3">
            {dueSoon.map((b) => {
              const d = getDaysUntilDue(b);
              const overdue = d !== null && d < 0;
              return (
                <div
                  key={b.id}
                  className={`bg-white border rounded-xl px-4 py-3.5 flex items-center gap-3 shadow-sm ${
                    overdue
                      ? "border-l-4 border-l-red-500 border-gray-200"
                      : "border-l-4 border-l-amber-500 border-gray-200"
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                    {b.icon || "📄"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{b.name}</span>
                      {overdue ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          Overdue
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Due in {d} day{d !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {getDueLabel(b)} · {b.shared ? "Shared" : "Personal"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-serif font-bold text-base text-gray-900">
                      ₱{Number(b.expected_amount).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingBill(b);
                      setEditAmount(String(b.expected_amount));
                      setEditScope("once");
                    }}
                    className="w-8 h-8 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 flex items-center justify-center flex-shrink-0"
                  >
                    ✎
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ALL BILLS SECTION */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
        ALL BILLS
      </p>
      <div className="flex flex-col gap-3">
        {allBills.length === 0 && (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500 text-sm">No bills yet — add one above.</p>
          </div>
        )}
        {allBills.map((b) => {
          const d = getDaysUntilDue(b);
          return (
            <div
              key={b.id}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-center gap-3 shadow-sm"
            >
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                {b.icon || "📄"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900">{b.name}</span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      b.shared ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {b.shared ? "Shared" : "Personal"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {getDueLabel(b)} · {b.category}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-serif font-bold text-base text-gray-900">
                  ₱{Number(b.expected_amount).toLocaleString()}
                </p>
                {d !== null && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {d < 0 ? "Overdue" : d === 0 ? "Due today" : `${d}d away`}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setEditingBill(b);
                  setEditAmount(String(b.expected_amount));
                  setEditScope("once");
                }}
                className="w-8 h-8 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 flex items-center justify-center flex-shrink-0"
              >
                ✎
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Bill Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setShowDrawer(false)} />
          <div className="w-full max-w-sm bg-white border-l border-gray-200 overflow-y-auto p-6 shadow-xl">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-serif text-xl font-bold text-gray-900">Add a bill</h2>
              <button onClick={() => setShowDrawer(false)} className="text-gray-400 hover:text-gray-600 text-xl">
                ×
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-5">Set the amount and exactly when it's due each month.</p>
            <form onSubmit={handleAddBill} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Bill name</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Home Credit Loan"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1b4332]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Expected amount (₱)</label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1b4332]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1b4332]"
                >
                  <option>Utilities</option>
                  <option>Housing</option>
                  <option>Loan / PayLater</option>
                  <option>Subscription</option>
                  <option>Other</option>
                </select>
              </div>

              {/* Schedule picker */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-2">Due date schedule</label>
                <div className="grid grid-cols-2 gap-2">
                  {SCHEDULES.map((s) => (
                    <button
                      type="button"
                      key={s.key}
                      onClick={() => setSchedule(s.key)}
                      className={`border rounded-xl p-3 text-left transition ${
                        schedule === s.key ? "border-[#1b4332] bg-[#e8f5e9]" : "border-gray-200"
                      }`}
                    >
                      <span className="text-lg block mb-1">{s.icon}</span>
                      <span className="font-semibold text-xs block text-gray-900">{s.label}</span>
                      <span className="text-[10px] text-gray-500">{s.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Specific day picker */}
              {schedule === "specific_days" && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-2">Which day(s) of the month?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => toggleDay(d)}
                        className={`w-7 h-7 rounded-full text-xs font-bold border transition ${
                          selectedDays.includes(d)
                            ? "bg-[#1b4332] text-white border-[#1b4332]"
                            : "border-gray-200 text-gray-700"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom date */}
              {schedule === "custom_date" && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Exact due date</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mt-1">
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                  className="rounded text-[#1b4332] focus:ring-[#1b4332]"
                />
                Shared with buddy
              </label>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Notes (optional)</label>
                <textarea
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="e.g. auto-deducted from GCash"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 resize-none h-16 text-sm outline-none"
                />
              </div>

              <button
                type="submit"
                className="bg-[#1b4332] text-white font-semibold rounded-xl py-2.5 text-xs hover:bg-[#2d6a4f] transition-colors mt-2"
              >
                Save bill
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBill && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-5 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-serif text-lg font-bold text-gray-900 mb-1">
              Edit {editingBill.name}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Expected ₱{Number(editingBill.expected_amount).toLocaleString()}
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {(["once", "forward"] as const).map((s) => (
                <label
                  key={s}
                  className={`border rounded-xl px-3.5 py-3 flex gap-2.5 items-start cursor-pointer ${
                    editScope === s ? "border-[#1b4332] bg-[#e8f5e9]" : "border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    checked={editScope === s}
                    onChange={() => setEditScope(s)}
                    className="mt-0.5 text-[#1b4332] focus:ring-[#1b4332]"
                  />
                  <span>
                    <strong className="block text-xs font-semibold text-gray-900">
                      {s === "once" ? "Just this bill" : "Going forward"}
                    </strong>
                    <span className="text-[11px] text-gray-500">
                      {s === "once"
                        ? "Fix this cutoff only — reverts next time."
                        : "Price changed for good — update every cutoff."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Actual amount (₱)
            </label>
            <input
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditingBill(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 bg-[#1b4332] text-white font-semibold rounded-xl py-2 text-xs hover:bg-[#2d6a4f]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
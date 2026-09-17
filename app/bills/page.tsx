"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";

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

function getDueLabel(bill: Bill): string {
  switch (bill.due_schedule) {
    case "end_of_month": return "Due end of month";
    case "per_cutoff": return "Due per cutoff (15th & 30th)";
    case "specific_days":
      if (!bill.due_days?.length) return "Due on specific days";
      return `Due on ${bill.due_days.map((d) => `${d}th`).join(", ")} of each month`;
    case "custom_date":
      return bill.due_custom_date ? `Due ${bill.due_custom_date}` : "Custom date";
    default: return "";
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
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase
      .from("recurring_bills")
      .select("*")
      .eq("user_id", uid)
      .eq("active", true)
      .order("created_at", { ascending: false });
    setBills(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function toggleDay(d: number) {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function resetForm() {
    setName(""); setAmount(""); setCategory("Utilities");
    setSchedule("end_of_month"); setSelectedDays([]);
    setCustomDate(""); setShared(true); setBillNotes("");
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
        .from("cutoffs").select("id").eq("user_id", userId)
        .order("start_date", { ascending: false }).limit(1);
      const cid = cutoffs?.[0]?.id;
      if (cid) {
        await supabase.from("allocations").insert({
          user_id: userId, cutoff_id: cid, category: "bills",
          amount: newAmount, bill_id: editingBill.id, shared: editingBill.shared,
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

  if (loading) return <div className="max-w-3xl mx-auto px-5 py-10"><p className="text-inksoft">Loading bills...</p></div>;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display text-xl font-semibold">Ipon</span>
        <span className="text-xs text-inksoft">your cutoff, tracked</span>
      </div>
      <NavTabs />

      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-semibold">Bills &amp; dues</h1>
        <button onClick={() => setShowDrawer(true)} className="bg-jade text-paperraised font-semibold rounded-xl px-4 py-2 text-sm">
          + Add bill
        </button>
      </div>
      <p className="text-inksoft text-sm mb-5">Set your own due date per bill — flexible to match any payment schedule.</p>

      {/* Due soon */}
      {dueSoon.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-inksoft uppercase tracking-widest mb-3">Due soon</p>
          <div className="flex flex-col gap-2.5">
            {dueSoon.map((b) => {
              const d = getDaysUntilDue(b);
              const overdue = d !== null && d < 0;
              return (
                <div key={b.id} className={`bg-paperraised border rounded-card px-4 py-3.5 flex items-center gap-3 ${overdue ? "border-l-4 border-l-coral border-line" : "border-l-4 border-l-gold border-line"}`}>
                  <div className="w-9 h-9 rounded-xl bg-sage flex items-center justify-center text-base flex-shrink-0">{b.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{b.name}</span>
                      {overdue
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-coralsoft text-coral">Overdue</span>
                        : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Due in {d} day{d !== 1 ? "s" : ""}</span>
                      }
                    </div>
                    <p className="text-xs text-inksoft mt-0.5">{getDueLabel(b)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-display font-semibold">₱{Number(b.expected_amount).toLocaleString()}</p>
                  </div>
                  <button onClick={() => { setEditingBill(b); setEditAmount(String(b.expected_amount)); setEditScope("once"); }}
                    className="w-8 h-8 border border-line rounded-lg text-inksoft hover:border-jade hover:text-jade">✎</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All bills */}
      <p className="text-xs font-semibold text-inksoft uppercase tracking-widest mb-3">All bills</p>
      <div className="flex flex-col gap-2.5">
        {allBills.length === 0 && <p className="text-inksoft text-sm">No bills yet — add one above.</p>}
        {allBills.map((b) => {
          const d = getDaysUntilDue(b);
          return (
            <div key={b.id} className="bg-paperraised border border-line rounded-card px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sage flex items-center justify-center text-base flex-shrink-0">{b.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{b.name}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${b.shared ? "bg-sage text-jadedeep" : "bg-line text-inksoft"}`}>
                    {b.shared ? "Shared" : "Personal"}
                  </span>
                </div>
                <p className="text-xs text-inksoft mt-0.5">{getDueLabel(b)} · {b.category}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-display font-semibold">₱{Number(b.expected_amount).toLocaleString()}</p>
                {d !== null && <p className="text-xs text-inksoft mt-0.5">{d < 0 ? "Overdue" : d === 0 ? "Due today" : `${d}d away`}</p>}
              </div>
              <button onClick={() => { setEditingBill(b); setEditAmount(String(b.expected_amount)); setEditScope("once"); }}
                className="w-8 h-8 border border-line rounded-lg text-inksoft hover:border-jade hover:text-jade flex-shrink-0">✎</button>
            </div>
          );
        })}
      </div>

      {/* Add bill drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowDrawer(false)} />
          <div className="w-full max-w-sm bg-paperraised border-l border-line overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-display text-xl font-semibold">Add a bill</h2>
              <button onClick={() => setShowDrawer(false)} className="text-inksoft text-xl">×</button>
            </div>
            <p className="text-xs text-inksoft mb-5">Set the amount and exactly when it's due each month.</p>
            <form onSubmit={handleAddBill} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-inksoft block mb-1">Bill name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Home Credit Loan"
                  className="w-full border border-line rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs font-semibold text-inksoft block mb-1">Expected amount (₱)</label>
                <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs font-semibold text-inksoft block mb-1">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2">
                  <option>Utilities</option>
                  <option>Housing</option>
                  <option>Loan / PayLater</option>
                  <option>Subscription</option>
                  <option>Other</option>
                </select>
              </div>

              {/* Schedule picker */}
              <div>
                <label className="text-xs font-semibold text-inksoft block mb-2">Due date schedule</label>
                <div className="grid grid-cols-2 gap-2">
                  {SCHEDULES.map((s) => (
                    <button type="button" key={s.key}
                      onClick={() => setSchedule(s.key)}
                      className={`border rounded-xl p-3 text-left transition ${schedule === s.key ? "border-jade bg-sage" : "border-line"}`}>
                      <span className="text-lg block mb-1">{s.icon}</span>
                      <span className="font-semibold text-xs block">{s.label}</span>
                      <span className="text-xs text-inksoft">{s.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Specific day picker */}
              {schedule === "specific_days" && (
                <div>
                  <label className="text-xs font-semibold text-inksoft block mb-2">Which day(s) of the month?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <button type="button" key={d}
                        onClick={() => toggleDay(d)}
                        className={`w-8 h-8 rounded-full text-xs font-bold border transition ${selectedDays.includes(d) ? "bg-jade text-paperraised border-jade" : "border-line"}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom date */}
              {schedule === "custom_date" && (
                <div>
                  <label className="text-xs font-semibold text-inksoft block mb-1">Exact due date</label>
                  <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full border border-line rounded-lg px-3 py-2" />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                Shared with buddy
              </label>

              <div>
                <label className="text-xs font-semibold text-inksoft block mb-1">Notes (optional)</label>
                <textarea value={billNotes} onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="e.g. auto-deducted from GCash"
                  className="w-full border border-line rounded-lg px-3 py-2 resize-none h-16 text-sm" />
              </div>

              <button type="submit" className="bg-jade text-paperraised font-semibold rounded-xl py-3 mt-1">
                Save bill
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-5 z-50">
          <div className="bg-paperraised rounded-card p-6 w-full max-w-sm">
            <h3 className="font-display text-lg font-semibold mb-1">Edit {editingBill.name}</h3>
            <p className="text-xs text-inksoft mb-4">Expected ₱{Number(editingBill.expected_amount).toLocaleString()}</p>
            <div className="flex flex-col gap-2 mb-4">
              {(["once", "forward"] as const).map((s) => (
                <label key={s} className={`border rounded-xl px-3.5 py-3 flex gap-2.5 items-start cursor-pointer ${editScope === s ? "border-jade bg-sage" : "border-line"}`}>
                  <input type="radio" checked={editScope === s} onChange={() => setEditScope(s)} className="mt-0.5" />
                  <span>
                    <strong className="block text-sm">{s === "once" ? "Just this bill" : "Going forward"}</strong>
                    <span className="text-xs text-inksoft">
                      {s === "once" ? "Fix this cutoff only — reverts next time." : "Price changed for good — update every cutoff."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="text-xs font-semibold text-inksoft block mb-1">Actual amount</label>
            <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setEditingBill(null)} className="flex-1 border border-line rounded-xl py-2.5 text-sm">Cancel</button>
              <button onClick={handleSaveEdit} className="flex-1 bg-jade text-paperraised font-semibold rounded-xl py-2.5 text-sm">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";

type Cutoff = {
  id: string;
  start_date: string;
  end_date: string;
  target_amount: number;
};

type Allocation = {
  id: string;
  category: "savings" | "bills" | "groceries" | "other";
  amount: number;
  note: string | null;
};

type IncomeEntry = {
  id: string;
  amount: number;
  source: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  savings: "Savings",
  bills: "Bills",
  groceries: "Groceries",
  other: "Other",
};

export default function DashboardPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [cutoff, setCutoff] = useState<Cutoff | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
  const [availableCash, setAvailableCash] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showNewCutoff, setShowNewCutoff] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  const [allocTitle, setAllocTitle] = useState("");
  const [allocCategory, setAllocCategory] = useState<Allocation["category"]>("savings");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocOtherDetail, setAllocOtherDetail] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }

    // latest cutoff for this user
    const { data: cutoffs } = await supabase
      .from("cutoffs")
      .select("*")
      .eq("user_id", uid)
      .order("start_date", { ascending: false });

    const current = cutoffs?.[0] ?? null;
    setCutoff(current);

    // all-time income and allocations to compute available cash
    const { data: allIncome } = await supabase
      .from("income_entries")
      .select("amount")
      .eq("user_id", uid);
    const { data: allAllocations } = await supabase
      .from("allocations")
      .select("amount")
      .eq("user_id", uid);

    const totalIncome = (allIncome ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const totalAllocated = (allAllocations ?? []).reduce((s, r) => s + Number(r.amount), 0);
    setAvailableCash(totalIncome - totalAllocated);

    if (current) {
      const { data: currentAllocations } = await supabase
        .from("allocations")
        .select("id, category, amount, note")
        .eq("user_id", uid)
        .eq("cutoff_id", current.id)
        .order("created_at", { ascending: false });
      setAllocations(currentAllocations ?? []);

      const { data: currentIncome } = await supabase
        .from("income_entries")
        .select("id, amount, source")
        .eq("user_id", uid)
        .eq("cutoff_id", current.id)
        .order("created_at", { ascending: false });
      setIncomeEntries(currentIncome ?? []);
    } else {
      setAllocations([]);
      setIncomeEntries([]);
    }

    // streak: count consecutive past cutoffs (excluding current) where savings met target
    if (cutoffs && cutoffs.length > 1) {
      const past = cutoffs.slice(1); // exclude the latest/current one
      let streakCount = 0;
      for (const c of past) {
        const { data: savingsRows } = await supabase
          .from("allocations")
          .select("amount")
          .eq("user_id", uid)
          .eq("cutoff_id", c.id)
          .eq("category", "savings");
        const saved = (savingsRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
        if (saved >= Number(c.target_amount)) {
          streakCount++;
        } else {
          break;
        }
      }
      setStreak(streakCount);
    } else {
      setStreak(0);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateCutoff(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    await supabase.from("cutoffs").insert({
      user_id: userId,
      start_date: newStart,
      end_date: newEnd,
      target_amount: Number(newTarget) || 0,
    });
    setShowNewCutoff(false);
    setNewStart("");
    setNewEnd("");
    setNewTarget("");
    loadData();
  }

  async function handleLogIncome(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !cutoff || !incomeAmount) return;
    await supabase.from("income_entries").insert({
      user_id: userId,
      cutoff_id: cutoff.id,
      amount: Number(incomeAmount),
      source: incomeSource.trim() || null,
    });
    setIncomeAmount("");
    setIncomeSource("");
    loadData();
  }

  async function handleAllocate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !cutoff || !allocAmount) return;

    // Build the note: the title the user typed, plus — for "Other" — where
    // the money was spent, appended on its own line.
    let note = allocTitle.trim();
    if (allocCategory === "other" && allocOtherDetail.trim()) {
      note = note ? `${note} — ${allocOtherDetail.trim()}` : allocOtherDetail.trim();
    }

    await supabase.from("allocations").insert({
      user_id: userId,
      cutoff_id: cutoff.id,
      category: allocCategory,
      amount: Number(allocAmount),
      note: note || null,
    });
    setAllocTitle("");
    setAllocAmount("");
    setAllocOtherDetail("");
    loadData();
  }

  const savedThisCutoff = allocations
    .filter((a) => a.category === "savings")
    .reduce((s, a) => s + Number(a.amount), 0);
  const target = cutoff ? Number(cutoff.target_amount) : 0;
  const progressPct = target > 0 ? Math.min(100, Math.round((savedThisCutoff / target) * 100)) : 0;

  const totalsByCategory = (["savings", "bills", "groceries", "other"] as const).map((cat) => ({
    category: cat,
    amount: allocations.filter((a) => a.category === cat).reduce((s, a) => s + Number(a.amount), 0),
  }));

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <p className="text-inksoft">Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display text-xl font-semibold">Ipon</span>
        <span className="text-xs text-inksoft">your cutoff, tracked</span>
      </div>

      <NavTabs />

      {!cutoff && !showNewCutoff && (
        <div className="border border-dashed border-line rounded-card p-8 text-center">
          <p className="text-inksoft mb-4">No active cutoff yet. Create one to start tracking.</p>
          <button
            onClick={() => setShowNewCutoff(true)}
            className="bg-jade text-paperraised font-semibold rounded-xl px-5 py-2.5"
          >
            Create your first cutoff
          </button>
        </div>
      )}

      {showNewCutoff && (
        <form
          onSubmit={handleCreateCutoff}
          className="bg-paperraised border border-line rounded-card p-6 mb-6 flex flex-col gap-3"
        >
          <h2 className="font-display text-lg font-semibold">New cutoff</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-inksoft block mb-1">Start date</label>
              <input type="date" required value={newStart} onChange={(e) => setNewStart(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs font-semibold text-inksoft block mb-1">End date</label>
              <input type="date" required value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-inksoft block mb-1">Savings target (₱)</label>
            <input type="number" required value={newTarget} onChange={(e) => setNewTarget(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2" />
          </div>
          <div className="flex gap-2 mt-2">
            <button type="submit" className="bg-jade text-paperraised font-semibold rounded-xl px-5 py-2.5">
              Create
            </button>
            <button type="button" onClick={() => setShowNewCutoff(false)}
              className="border border-line rounded-xl px-5 py-2.5">
              Cancel
            </button>
          </div>
        </form>
      )}

      {cutoff && (
        <>
          {/* Hero summary */}
          <div className="bg-gradient-to-br from-jadedeep to-jade rounded-3xl p-7 text-paperraised mb-5">
            <p className="text-sm opacity-80 mb-1">
              {cutoff.start_date} – {cutoff.end_date}
            </p>
            <h1 className="font-display text-3xl font-semibold mb-6">
              ₱{savedThisCutoff.toLocaleString()} saved of ₱{target.toLocaleString()}
            </h1>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs opacity-75">Progress</p>
                <p className="font-display text-2xl font-semibold">{progressPct}%</p>
              </div>
              <div>
                <p className="text-xs opacity-75">Streak</p>
                <p className="font-display text-2xl font-semibold text-gold">{streak} cutoffs</p>
              </div>
              <div>
                <p className="text-xs opacity-75">Available cash</p>
                <p className="font-display text-2xl font-semibold">₱{availableCash.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Log income */}
          <div className="bg-paperraised border border-line rounded-card p-6 mb-5">
            <h2 className="font-display text-lg font-semibold mb-3">Log income</h2>
            <form onSubmit={handleLogIncome} className="flex flex-col gap-2 mb-1">
              <input
                type="text"
                placeholder="Where's this from? e.g. Salary, Freelance, Gift"
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
                className="border border-line rounded-lg px-3 py-2"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Amount (₱)"
                  value={incomeAmount}
                  onChange={(e) => setIncomeAmount(e.target.value)}
                  className="flex-1 border border-line rounded-lg px-3 py-2"
                />
                <button type="submit" className="bg-jade text-paperraised font-semibold rounded-xl px-5">
                  Add
                </button>
              </div>
            </form>
            <p className="text-xs text-inksoft mt-2 mb-3">
              This adds to your available cash pool. Allocate it below.
            </p>

            {incomeEntries.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-inksoft mb-2">Income this cutoff</p>
                <div className="flex flex-col gap-1.5">
                  {incomeEntries.map((inc) => (
                    <div key={inc.id} className="flex justify-between items-center text-sm bg-paper rounded-lg px-3 py-2">
                      <span className="font-medium">{inc.source || "Income"}</span>
                      <span className="font-semibold text-jade">₱{Number(inc.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Allocate */}
          <div className="bg-paperraised border border-line rounded-card p-6 mb-5">
            <h2 className="font-display text-lg font-semibold mb-3">Allocate this cutoff</h2>
            <form onSubmit={handleAllocate} className="flex flex-col gap-2 mb-4">
              <input
                type="text"
                placeholder="What's this for? e.g. Weekly groceries, Emergency fund"
                value={allocTitle}
                onChange={(e) => setAllocTitle(e.target.value)}
                className="border border-line rounded-lg px-3 py-2"
              />

              <div className="flex flex-wrap gap-2">
                <select
                  value={allocCategory}
                  onChange={(e) => setAllocCategory(e.target.value as Allocation["category"])}
                  className="border border-line rounded-lg px-3 py-2"
                >
                  <option value="savings">Savings</option>
                  <option value="bills">Bills</option>
                  <option value="groceries">Groceries</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="number"
                  placeholder="Amount (₱)"
                  value={allocAmount}
                  onChange={(e) => setAllocAmount(e.target.value)}
                  className="flex-1 min-w-[120px] border border-line rounded-lg px-3 py-2"
                />
                <button type="submit" className="bg-jade text-paperraised font-semibold rounded-xl px-5">
                  Allocate
                </button>
              </div>

              {allocCategory === "other" && (
                <input
                  type="text"
                  placeholder="Where did you spend this?"
                  value={allocOtherDetail}
                  onChange={(e) => setAllocOtherDetail(e.target.value)}
                  className="border border-line rounded-lg px-3 py-2 bg-sage/40"
                />
              )}
            </form>

            {/* Category totals */}
            <div className="flex flex-col gap-2 mb-4">
              {totalsByCategory.map((t) => (
                <div key={t.category} className="flex justify-between text-sm border-b border-dashed border-line py-2 last:border-none">
                  <span className="text-inksoft">{CATEGORY_LABEL[t.category]}</span>
                  <span className="font-semibold">₱{t.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Individual entries, most recent first */}
            {allocations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-inksoft mb-2">Entries this cutoff</p>
                <div className="flex flex-col gap-1.5">
                  {allocations.map((a) => (
                    <div key={a.id} className="flex justify-between items-start text-sm bg-paper rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.note || CATEGORY_LABEL[a.category]}</p>
                        <p className="text-xs text-inksoft">{CATEGORY_LABEL[a.category]}</p>
                      </div>
                      <span className="font-semibold flex-shrink-0 ml-3">₱{Number(a.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowNewCutoff(true)}
            className="text-sm text-jade font-semibold"
          >
            + Start a new cutoff
          </button>
        </>
      )}
    </div>
  );
}

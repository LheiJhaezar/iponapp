// app/dashboard/page.tsx
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
  created_at?: string;
};

type IncomeEntry = {
  id: string;
  amount: number;
  source: string | null;
  created_at?: string;
};

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

type Bill = {
  id: string;
  name: string;
  expected_amount: number;
  due_schedule: string;
  active: boolean;
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
  const [todayFood, setTodayFood] = useState<FoodEntry | null>(null);
  const [activeBills, setActiveBills] = useState<Bill[]>([]);
  const [availableCash, setAvailableCash] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modals & Drawers State
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showNewCutoff, setShowNewCutoff] = useState(false);

  // Form Inputs State
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

    // Fetch latest cutoff
    const { data: cutoffs } = await supabase
      .from("cutoffs")
      .select("*")
      .eq("user_id", uid)
      .order("start_date", { ascending: false });

    const current = cutoffs?.[0] ?? null;
    setCutoff(current);

    // Compute all-time available cash
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

    // Fetch active recurring bills
    const { data: billsData } = await supabase
      .from("recurring_bills")
      .select("*")
      .eq("user_id", uid)
      .eq("active", true)
      .limit(3);
    setActiveBills(billsData ?? []);

    // Fetch today's food log entry
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: foodData } = await supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", uid)
      .eq("log_date", todayStr)
      .maybeSingle();
    setTodayFood(foodData ?? null);

    if (current) {
      // Fetch cutoff allocations
      const { data: currentAllocations } = await supabase
        .from("allocations")
        .select("id, category, amount, note, created_at")
        .eq("user_id", uid)
        .eq("cutoff_id", current.id)
        .order("created_at", { ascending: false });
      setAllocations(currentAllocations ?? []);

      // Fetch cutoff income entries
      const { data: currentIncome } = await supabase
        .from("income_entries")
        .select("id, amount, source, created_at")
        .eq("user_id", uid)
        .eq("cutoff_id", current.id)
        .order("created_at", { ascending: false });
      setIncomeEntries(currentIncome ?? []);
    } else {
      setAllocations([]);
      setIncomeEntries([]);
    }

    // Calculate streak from previous cutoffs
    if (cutoffs && cutoffs.length > 1) {
      const past = cutoffs.slice(1);
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
    setShowIncomeModal(false);
    loadData();
  }

  async function handleAllocate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !cutoff || !allocAmount) return;

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
    setShowAllocateModal(false);
    loadData();
  }

  const savedThisCutoff = allocations
    .filter((a) => a.category === "savings")
    .reduce((s, a) => s + Number(a.amount), 0);

  const target = cutoff ? Number(cutoff.target_amount) : 0;
  const progressPct = target > 0 ? Math.min(100, Math.round((savedThisCutoff / target) * 100)) : 0;

  // Calculate logged meal items dynamically
  const loggedMealsCount = todayFood
    ? [
        todayFood.breakfast,
        todayFood.brunch,
        todayFood.lunch,
        todayFood.merienda,
        todayFood.dinner,
        todayFood.extra,
      ].filter(Boolean).length
    : 0;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-10">
        <p className="text-gray-500 text-sm font-medium">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Top Header Navigation */}
      <NavTabs />

      {!cutoff && !showNewCutoff && (
        <div className="border border-dashed border-gray-300 rounded-2xl p-8 text-center bg-white my-6">
          <p className="text-gray-500 mb-4 text-sm">No active cutoff yet. Create one to start tracking.</p>
          <button
            onClick={() => setShowNewCutoff(true)}
            className="bg-[#1b4332] text-white font-semibold rounded-xl px-5 py-2.5 text-xs hover:bg-[#2d6a4f] shadow-sm"
          >
            Create your first cutoff
          </button>
        </div>
      )}

      {showNewCutoff && (
        <form
          onSubmit={handleCreateCutoff}
          className="bg-white border border-gray-200 rounded-2xl p-6 my-6 flex flex-col gap-3 shadow-sm"
        >
          <h2 className="font-serif text-lg font-bold text-gray-900">New cutoff</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Start date</label>
              <input
                type="date"
                required
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">End date</label>
              <input
                type="date"
                required
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Savings target (₱)</label>
            <input
              type="number"
              required
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              className="bg-[#1b4332] text-white font-semibold rounded-xl px-5 py-2 text-xs hover:bg-[#2d6a4f]"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowNewCutoff(false)}
              className="border border-gray-300 rounded-xl px-5 py-2 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {cutoff && (
        <main className="space-y-4 mt-4">
          {/* Main Hero Banner */}
          <div className="bg-[#1b4332] rounded-2xl p-6 text-white shadow-sm">
            <p className="text-xs text-gray-300 font-medium mb-1">
              {cutoff.start_date} – {cutoff.end_date} cutoff
            </p>
            <h1 className="font-serif text-3xl font-bold tracking-tight">
              ₱{savedThisCutoff.toLocaleString()}{" "}
              <span className="font-sans font-normal text-xl text-gray-300">
                saved of ₱{target.toLocaleString()}
              </span>
            </h1>
          </div>

          {/* 4 Metrics Summary Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 text-center shadow-sm">
              <p className="font-serif text-xl font-bold text-gray-900">{progressPct}%</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Progress</p>
            </div>
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 text-center shadow-sm">
              <p className="font-serif text-xl font-bold text-gray-900">{streak}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Streak</p>
            </div>
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 text-center shadow-sm">
              <p className="font-serif text-xl font-bold text-gray-900">
                ₱{availableCash.toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">Available</p>
            </div>
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 text-center shadow-sm">
              <p className="font-serif text-xl font-bold text-gray-900">{activeBills.length}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Bills due</p>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
            <button
              onClick={() => setShowIncomeModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50 whitespace-nowrap"
            >
              💰 Log Income
            </button>
            <button
              onClick={() => setShowAllocateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50 whitespace-nowrap"
            >
              📊 Allocate
            </button>
            <a
              href="/food"
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50 whitespace-nowrap"
            >
              🍜 Log food
            </a>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50 whitespace-nowrap">
              🙂 Log mood
            </button>
          </div>

          {/* Middle 2x2 Grid Section */}
          <div className="grid grid-cols-2 gap-4">
            {/* Today's Food Summary */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-800">Today's food</span>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  {loggedMealsCount} logged
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {todayFood?.breakfast && (
                  <span className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
                    Breakfast
                  </span>
                )}
                {todayFood?.lunch && (
                  <span className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
                    Lunch
                  </span>
                )}
                {todayFood?.dinner && (
                  <span className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
                    Dinner
                  </span>
                )}
                {!todayFood && (
                  <span className="text-xs text-gray-400 italic">No food logged today</span>
                )}
              </div>
            </div>

            {/* Mood Container */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-800 mb-3">Mood, last 7 days</p>
              <div className="flex items-center justify-between">
                {["🙂", "🙂", "🙂", "😀", "🙂", "😐", "😃"].map((emoji, idx) => (
                  <div
                    key={idx}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                      idx === 6 ? "bg-amber-100 border border-amber-300" : "bg-gray-100"
                    }`}
                  >
                    {emoji}
                  </div>
                ))}
              </div>
            </div>

            {/* Bills Overview Container */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-800">Bills</span>
                <a href="/bills" className="text-[10px] text-emerald-800 font-semibold hover:underline">
                  View all
                </a>
              </div>
              <div className="space-y-1.5 text-xs">
                {activeBills.length === 0 && (
                  <p className="text-gray-400 italic text-[11px]">No active recurring bills</p>
                )}
                {activeBills.map((b) => (
                  <div key={b.id} className="flex justify-between text-gray-600">
                    <span className="truncate max-w-[120px]">{b.name}</span>
                    <span className="font-serif font-bold text-gray-900">
                      ₱{Number(b.expected_amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Buddy Summary Container */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-800 mb-3">Buddy</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Combined saved</span>
                  <span className="font-serif font-bold text-gray-900">₱{savedThisCutoff.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Buddy streak</span>
                  <span className="font-semibold text-gray-800">{streak} cutoffs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity Section */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-800 mb-3">Recent activity</h3>
            <div className="divide-y divide-gray-100">
              {incomeEntries.length === 0 && allocations.length === 0 && (
                <p className="py-4 text-center text-xs text-gray-400">No activity recorded for this cutoff yet.</p>
              )}

              {/* Income Entries */}
              {incomeEntries.map((inc) => (
                <div key={inc.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-sm">💰</div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">{inc.source || "Income"}</p>
                      <p className="text-[11px] text-gray-400">Income Entry</p>
                    </div>
                  </div>
                  <span className="font-serif font-bold text-xs text-gray-900">
                    +₱{Number(inc.amount).toLocaleString()}
                  </span>
                </div>
              ))}

              {/* Allocation Entries */}
              {allocations.map((a) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-sm">
                      {a.category === "savings" ? "🌱" : "🛒"}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">{a.note || CATEGORY_LABEL[a.category]}</p>
                      <p className="text-[11px] text-gray-400">{CATEGORY_LABEL[a.category]}</p>
                    </div>
                  </div>
                  <span className="font-serif font-bold text-xs text-gray-900">
                    ₱{Number(a.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* Log Income Modal */}
      {showIncomeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-base font-serif font-bold text-gray-900 mb-4">Log Income</h3>
            <form onSubmit={handleLogIncome} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Source</label>
                <input
                  type="text"
                  placeholder="e.g. Salary, Freelance, Gift"
                  value={incomeSource}
                  onChange={(e) => setIncomeSource(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Amount (₱)</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={incomeAmount}
                  onChange={(e) => setIncomeAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIncomeModal(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#1b4332] text-white text-xs font-semibold rounded-lg hover:bg-[#2d6a4f]"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Modal */}
      {showAllocateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-base font-serif font-bold text-gray-900 mb-4">Allocate Money</h3>
            <form onSubmit={handleAllocate} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly groceries, Emergency fund"
                  value={allocTitle}
                  onChange={(e) => setAllocTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Category</label>
                <select
                  value={allocCategory}
                  onChange={(e) => setAllocCategory(e.target.value as Allocation["category"])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="savings">Savings</option>
                  <option value="bills">Bills</option>
                  <option value="groceries">Groceries</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Amount (₱)</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={allocAmount}
                  onChange={(e) => setAllocAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              {allocCategory === "other" && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Details</label>
                  <input
                    type="text"
                    placeholder="Where was this spent?"
                    value={allocOtherDetail}
                    onChange={(e) => setAllocOtherDetail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAllocateModal(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#1b4332] text-white text-xs font-semibold rounded-lg hover:bg-[#2d6a4f]"
                >
                  Allocate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
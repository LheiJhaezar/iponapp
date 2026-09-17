"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";

type BuddyLink = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
};

type Profile = { id: string; email: string; full_name: string | null };

type SideSummary = {
  label: string;
  income: number;
  savings: number;
  bills: number;
  groceries: number;
  other: number;
  target: number;
};

async function loadSideSummary(
  supabase: ReturnType<typeof createClient>,
  uid: string,
  label: string
): Promise<SideSummary> {
  const { data: cutoffs } = await supabase
    .from("cutoffs")
    .select("id, target_amount")
    .eq("user_id", uid)
    .order("start_date", { ascending: false })
    .limit(1);

  const current = cutoffs?.[0];
  if (!current) {
    return { label, income: 0, savings: 0, bills: 0, groceries: 0, other: 0, target: 0 };
  }

  const { data: income } = await supabase
    .from("income_entries")
    .select("amount")
    .eq("user_id", uid)
    .eq("cutoff_id", current.id);

  const { data: allocs } = await supabase
    .from("allocations")
    .select("category, amount")
    .eq("user_id", uid)
    .eq("cutoff_id", current.id);

  const sum = (cat: string) =>
    (allocs ?? []).filter((a) => a.category === cat).reduce((s, a) => s + Number(a.amount), 0);

  return {
    label,
    income: (income ?? []).reduce((s, r) => s + Number(r.amount), 0),
    savings: sum("savings"),
    bills: sum("bills"),
    groceries: sum("groceries"),
    other: sum("other"),
    target: Number(current.target_amount),
  };
}

function Row({
  label,
  value,
  bold,
  color,
}: {
  label: string;
  value: number;
  bold?: boolean;
  color?: string;
}) {
  return (
    <div className="flex justify-between border-b border-dashed border-line py-1.5 last:border-none">
      <span className="text-inksoft">{label}</span>
      <span className={`${bold ? "font-display font-semibold text-base" : "font-semibold"} ${color ?? ""}`}>
        ₱{value.toLocaleString()}
      </span>
    </div>
  );
}

export default function BuddyPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [links, setLinks] = useState<BuddyLink[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<Record<string, [SideSummary, SideSummary]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }

    const { data: linkRows } = await supabase
      .from("buddy_links")
      .select("*")
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);

    setLinks(linkRows ?? []);

    const otherIds = (linkRows ?? []).map((l) =>
      l.requester_id === uid ? l.addressee_id : l.requester_id
    );
    if (otherIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", otherIds);
      const map: Record<string, Profile> = {};
      (profileRows ?? []).forEach((p) => (map[p.id] = p));
      setProfiles(map);

      // build combined summaries for accepted links only
      const acceptedRows = (linkRows ?? []).filter((l) => l.status === "accepted");
      const summaryMap: Record<string, [SideSummary, SideSummary]> = {};
      for (const l of acceptedRows) {
        const otherId = l.requester_id === uid ? l.addressee_id : l.requester_id;
        const [mine, theirs] = await Promise.all([
          loadSideSummary(supabase, uid, "You"),
          loadSideSummary(supabase, otherId, map[otherId]?.full_name ?? map[otherId]?.email ?? "Buddy"),
        ]);
        summaryMap[l.id] = [mine, theirs];
      }
      setSummaries(summaryMap);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!userId || !inviteEmail) return;

    const { data: found } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", inviteEmail)
      .maybeSingle();

    if (!found) {
      setMessage("No Ipon account found with that email.");
      return;
    }
    if (found.id === userId) {
      setMessage("You can't invite yourself.");
      return;
    }

    const { error } = await supabase.from("buddy_links").insert({
      requester_id: userId,
      addressee_id: found.id,
      status: "pending",
    });

    if (error) {
      setMessage("Could not send invite — you may already have a pending link with them.");
    } else {
      setMessage("Invite sent!");
      setInviteEmail("");
      load();
    }
  }

  async function respond(linkId: string, status: "accepted" | "declined") {
    await supabase.from("buddy_links").update({ status }).eq("id", linkId);
    load();
  }

  async function unlink(linkId: string) {
    await supabase.from("buddy_links").delete().eq("id", linkId);
    load();
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <p className="text-inksoft">Loading...</p>
      </div>
    );
  }

  const incoming = links.filter((l) => l.status === "pending" && l.addressee_id === userId);
  const outgoing = links.filter((l) => l.status === "pending" && l.requester_id === userId);
  const accepted = links.filter((l) => l.status === "accepted");

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display text-xl font-semibold">Ipon</span>
        <span className="text-xs text-inksoft">your cutoff, tracked</span>
      </div>

      <NavTabs />

      <h1 className="font-display text-2xl font-semibold mb-4">Buddy</h1>

      {/* Invite form */}
      <div className="bg-paperraised border border-line rounded-card p-5 mb-5">
        <h2 className="font-semibold text-sm mb-2">Invite a buddy</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            placeholder="Their Ipon account email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 border border-line rounded-lg px-3 py-2"
            required
          />
          <button type="submit" className="bg-jade text-paperraised font-semibold rounded-xl px-5">
            Invite
          </button>
        </form>
        {message && <p className="text-sm text-inksoft mt-2">{message}</p>}
      </div>

      {/* Incoming invites */}
      {incoming.map((l) => (
        <div key={l.id} className="bg-plumsoft border border-plum/30 rounded-card p-4 mb-3 flex items-center justify-between">
          <p className="text-sm">
            <strong>{profiles[l.requester_id]?.full_name ?? profiles[l.requester_id]?.email}</strong> wants to be your buddy
          </p>
          <div className="flex gap-2">
            <button onClick={() => respond(l.id, "accepted")} className="bg-jade text-paperraised text-sm font-semibold rounded-lg px-3 py-1.5">
              Accept
            </button>
            <button onClick={() => respond(l.id, "declined")} className="border border-line text-sm rounded-lg px-3 py-1.5">
              Decline
            </button>
          </div>
        </div>
      ))}

      {/* Outgoing invites */}
      {outgoing.map((l) => (
        <div key={l.id} className="border border-dashed border-line rounded-card p-4 mb-3 text-sm text-inksoft">
          Invite sent to {profiles[l.addressee_id]?.email} — waiting for them to accept.
        </div>
      ))}

      {/* Accepted buddies — combined view */}
      {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <p className="text-inksoft text-sm">No buddy linked yet. Invite someone above to get started.</p>
      )}

      {accepted.map((l) => {
        const otherId = l.requester_id === userId ? l.addressee_id : l.requester_id;
        const buddy = profiles[otherId];
        const pair = summaries[l.id];
        const combinedSaved = pair ? pair[0].savings + pair[1].savings : 0;
        const combinedTarget = pair ? pair[0].target + pair[1].target : 0;

        return (
          <div key={l.id} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">
                Linked with {buddy?.full_name ?? buddy?.email}
              </p>
              <button onClick={() => unlink(l.id)} className="text-xs text-coral font-semibold">
                Unlink
              </button>
            </div>

            {pair && (
              <>
                <div className="bg-gradient-to-br from-jadedeep to-jade rounded-3xl p-6 text-paperraised mb-4">
                  <p className="text-sm opacity-80 mb-1">Combined, this cutoff</p>
                  <h2 className="font-display text-2xl font-semibold mb-1">
                    ₱{combinedSaved.toLocaleString()} saved of ₱{combinedTarget.toLocaleString()}
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pair.map((side, i) => (
                    <div
                      key={i}
                      className={`bg-paperraised border border-line rounded-card p-5 border-t-[3px] ${
                        i === 0 ? "border-t-jade" : "border-t-plum"
                      }`}
                    >
                      <p className="font-bold text-sm mb-3">{side.label}</p>
                      <div className="flex flex-col gap-1.5 text-sm">
                        <Row label="Income logged" value={side.income} bold />
                        <Row label="Allocated to savings" value={side.savings} color="text-jade" />
                        <Row label="Allocated to bills" value={side.bills} />
                        <Row label="Allocated to groceries" value={side.groceries} />
                        <Row label="Available (this cutoff)" value={side.income - side.savings - side.bills - side.groceries - side.other} color="text-golddeep" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

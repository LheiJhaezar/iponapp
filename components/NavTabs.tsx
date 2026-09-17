"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bills", label: "Bills" },
  { href: "/food", label: "Food log" },
  { href: "/buddy", label: "Buddy" },
];

export default function NavTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between mb-5 gap-3">
      <div className="flex gap-1.5 bg-sage p-1 rounded-full flex-1 max-w-md">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 text-center px-3 py-2 rounded-full text-sm font-semibold transition ${
              pathname.startsWith(tab.href)
                ? "bg-paperraised text-jadedeep shadow-sm"
                : "text-jadedeep/70"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <button
        onClick={handleLogout}
        className="text-sm font-medium text-inksoft border border-line rounded-full px-4 py-2 hover:border-jade hover:text-jade transition"
      >
        Log out
      </button>
    </div>
  );
}

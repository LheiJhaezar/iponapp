// components/NavTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavTabs() {
  const pathname = usePathname();

  const isBillsOrFood = pathname.startsWith("/bills") || pathname.startsWith("/food");
  const isDashboard = pathname === "/dashboard" || pathname === "/";
  const isBuddy = pathname.startsWith("/buddy");

  return (
    <header className="w-full max-w-5xl mx-auto px-4 pt-6 pb-2">
      {/* Top Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-emerald-950">
            Ipon <span className="text-xs font-sans font-normal text-gray-500">your cutoff, tracked</span>
          </h1>
        </div>
        {/* User Profile Avatar */}
        <div className="w-10 h-10 rounded-full bg-[#1b4332] text-white font-bold flex items-center justify-center text-sm shadow-sm cursor-pointer">
          M
        </div>
      </div>

      {/* Main Navigation Bar */}
      <nav className="w-full bg-[#d8e2dc]/60 p-1.5 rounded-full flex items-center justify-between">
        <Link
          href="/dashboard"
          className={`flex-1 text-center py-2 text-sm font-medium rounded-full transition-all ${
            isDashboard ? "bg-white text-emerald-950 shadow-sm" : "text-emerald-900 hover:text-emerald-950"
          }`}
        >
          Dashboard
        </Link>
        <Link
          href="/bills"
          className={`flex-1 text-center py-2 text-sm font-medium rounded-full transition-all ${
            isBillsOrFood ? "bg-white text-emerald-950 shadow-sm" : "text-emerald-900 hover:text-emerald-950"
          }`}
        >
          Bills & Food
        </Link>
        <Link
          href="/buddy"
          className={`flex-1 text-center py-2 text-sm font-medium rounded-full transition-all ${
            isBuddy ? "bg-white text-emerald-950 shadow-sm" : "text-emerald-900 hover:text-emerald-950"
          }`}
        >
          Buddy
        </Link>
      </nav>
    </header>
  );
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ImageUp,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  ShieldAlert,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

const GUARD_LINKS = [
  { href: "/duty", label: "My Duty", icon: MapIcon },
  { href: "/dashboard", label: "Live Fleet", icon: LayoutDashboard },
  { href: "/bookings", label: "Shifts", icon: CalendarDays },
  { href: "/uploads", label: "Uploads", icon: ImageUp },
  { href: "/incidents", label: "Incidents", icon: ShieldAlert },
];

const STAFF_LINKS = [
  ...GUARD_LINKS.filter((l) => l.href !== "/duty"),
  { href: "/vehicles", label: "Vehicles", icon: Truck },
  { href: "/reports", label: "Reports", icon: ShieldCheck },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { guard, isStaff } = useAuth();
  const links = isStaff ? STAFF_LINKS : GUARD_LINKS;

  async function signOut() {
    await getSupabase().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="dark-shell hidden w-64 shrink-0 flex-col border-r border-white/10 lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-400">
          <ShieldAlert className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Sentinel Fleet</p>
          <p className="text-[11px] text-slate-400">Security Ops Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <l.icon className="h-4 w-4" />
              {l.label}
              {l.href === "/dashboard" && (
                <span className="ml-auto flex h-2 w-2">
                  <span className="relative inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
            {guard ? (
              <UserRound className="h-4 w-4" />
            ) : (
              <span className="text-xs font-bold">?</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {guard?.full_name ?? "Signed in"}
            </p>
            <Badge variant="secondary" className="mt-0.5 text-[10px] capitalize">
              {guard?.role ?? "user"}
            </Badge>
          </div>
          <button
            onClick={signOut}
            className="rounded-md p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
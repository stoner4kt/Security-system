"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ImageUp, LayoutDashboard, Map as MapIcon, ShieldAlert, ShieldCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/use-auth";

const ICONS = {
  "/duty": MapIcon,
  "/dashboard": LayoutDashboard,
  "/bookings": CalendarDays,
  "/uploads": ImageUp,
  "/vehicles": Truck,
  "/reports": ShieldCheck,
  "/incidents": ShieldAlert,
};

export function TopNav() {
  const pathname = usePathname();
  const { guard, isStaff } = useAuth();

  const items = isStaff
    ? ["/dashboard", "/bookings", "/vehicles", "/uploads", "/reports", "/incidents"]
    : ["/duty", "/bookings", "/uploads", "/incidents"];

  return (
    <nav className="border-b border-white/10 bg-black/20 backdrop-blur lg:hidden">
      <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 no-scrollbar">
        {items.map((href) => {
          const Icon = ICONS[href as keyof typeof ICONS];
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-white/15 text-white" : "text-slate-300 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {href === "/duty"
                ? "Duty"
                : href === "/dashboard"
                  ? "Live Map"
                  : href === "/bookings"
                    ? "Shifts"
                    : href === "/vehicles"
                      ? "Vehicles"
                      : href === "/reports"
                        ? "Reports"
                        : href === "/incidents"
                          ? "Incidents"
                          : "Uploads"}
            </Link>
          );
        })}
        {pathname === "/dashboard" && guard && (
          <span className="ml-auto hidden items-center gap-1.5 px-2 text-xs text-emerald-400 sm:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            LIVE
          </span>
        )}
      </div>
    </nav>
  );
}
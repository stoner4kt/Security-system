"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, startOfWeek, endOfWeek } from "date-fns";
import type { BookingShiftRow } from "@/lib/hooks/use-bookings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-slate-200 text-slate-700",
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-rose-100 text-rose-600 line-through",
};

export function ShiftCalendar({ shifts }: { shifts: BookingShiftRow[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const grouped = useMemo(() => {
    const m = new Map<string, BookingShiftRow[]>();
    for (const s of shifts) {
      const key = new Date(s.starts_at).toISOString().slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [shifts]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px rounded-lg border bg-border">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-muted px-2 py-1.5 text-center text-[11px] font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayShifts = grouped.get(key) ?? [];
          const inMonth = isSameMonth(day, month);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[92px] bg-card p-1.5",
                !inMonth && "bg-muted/40",
                isSameDay(day, new Date()) && "ring-2 ring-inset ring-accent",
              )}
            >
              <span className={cn("text-xs font-medium", inMonth ? "text-foreground" : "text-muted-foreground")}>
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayShifts.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    title={`${s.shift_title} · ${s.guard?.full_name ?? ""} · ${s.vehicle?.registration ?? ""}`}
                    className={cn("truncate rounded px-1.5 py-0.5 text-[11px]", STATUS_STYLES[s.status])}
                  >
                    {s.vehicle?.registration ?? "—"}
                  </div>
                ))}
                {dayShifts.length > 3 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{dayShifts.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
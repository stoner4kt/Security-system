"use client";

import { useMemo, useState } from "react";
import { CalendarDays, KanbanSquare, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { BookingFormDialog } from "@/components/bookings/booking-form-dialog";
import { ShiftCalendar } from "@/components/bookings/shift-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookings } from "@/lib/hooks/use-bookings";
import type { BookingShiftRow } from "@/lib/hooks/use-bookings";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<string, "outline" | "success" | "secondary" | "danger"> = {
  scheduled: "outline",
  active: "success",
  completed: "secondary",
  cancelled: "danger",
};

export default function BookingsPage() {
  const { shifts, loading, error } = useBookings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BookingShiftRow | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const todayList = useMemo(
    () =>
      shifts.filter(
        (s) =>
          s.status === "active" ||
          (s.status === "scheduled" && s.starts_at.slice(0, 10) === today),
      ),
    [shifts, today],
  );

  const toEdit = (s: BookingShiftRow) => {
    setEditing(s);
    setDialogOpen(true);
  };

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 lg:px-0 lg:py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white">Bookings & Shift Management</h1>
            <p className="text-sm text-slate-400">
              Vehicle check-outs, shift schedules and mileage logs.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New shift
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table">
                  <KanbanSquare className="mr-1.5 h-4 w-4" /> Table
                </TabsTrigger>
                <TabsTrigger value="calendar">
                  <CalendarDays className="mr-1.5 h-4 w-4" /> Calendar
                </TabsTrigger>
              </TabsList>

              <TabsContent value="table">
                {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
                {loading ? (
                  <div className="space-y-2 py-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="thin-scroll overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-muted-foreground">
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Guard</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>End</TableHead>
                          <TableHead>Mileage</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shifts.map((s) => (
                          <TableRow
                            key={s.id}
                            className="cursor-pointer"
                            onClick={() => toEdit(s)}
                          >
                            <TableCell className="font-medium">
                              {s.vehicle?.registration ?? "—"}
                              <span className="block text-xs text-muted-foreground">
                                {s.vehicle
                                  ? `${s.vehicle.make} ${s.vehicle.model}`
                                  : "Deleted vehicle"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {s.guard?.full_name ?? "—"}
                              {s.guard?.badge_number ? (
                                <span className="block text-xs text-muted-foreground">
                                  {s.guard.badge_number}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell>{formatDate(s.starts_at)}</TableCell>
                            <TableCell>{s.ends_at ? formatDate(s.ends_at) : "Open"}</TableCell>
                            <TableCell>
                              {s.distance_km != null
                                ? `${Math.round(s.distance_km)} km`
                                : s.odometer_start != null
                                  ? `${Math.round(s.odometer_start)} km start`
                                  : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>
                                {s.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {shifts.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                              No shifts yet. Create your first one.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="calendar">
                <ShiftCalendar shifts={shifts} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {todayList.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-2 text-sm font-semibold">Today&apos;s patrols</h3>
              <div className="flex flex-wrap gap-2">
                {todayList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toEdit(s)}
                    className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition hover:border-accent"
                  >
                    <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{s.status}</Badge>
                    {s.vehicle?.registration ?? "—"}
                    <span className="text-muted-foreground">
                      {s.guard?.full_name ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <BookingFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
    </DashboardShell>
  );
}
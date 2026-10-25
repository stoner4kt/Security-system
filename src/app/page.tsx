"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, MapPin, ShieldAlert, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase/client";

export default function HomePage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    getSupabase().auth.getSession().then(({ data }) => setAuthed(Boolean(data.session)));
  }, []);

  return (
    <div className="dark-shell flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-400 shadow-xl shadow-blue-900/40">
        <ShieldAlert className="h-9 w-9 text-white" />
      </div>
      <h1 className="max-w-xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Sentinel Fleet
      </h1>
      <p className="mt-3 max-w-md text-slate-400">
        Live vehicle tracking, shift bookings and real-time patrol monitoring
        for security operations.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {authed ? (
          <Link href="/duty">
            <Button size="lg">
              Open console <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Link href="/login">
            <Button size="lg">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <Link href="/register">
          <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
            Register a guard account
          </Button>
        </Link>
      </div>

      <div className="mt-14 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        <Feature icon={MapPin} title="Real-time fleet map" desc="15 s GPS pings, Realtime WebSockets, OSM tiles" />
        <Feature icon={CalendarDays} title="Shift bookings" desc="Table & calendar views, mileage logging" />
        <Feature icon={Truck} title="Route playback" desc="Historical GPS trails for any vehicle" />
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof MapPin; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur">
      <Icon className="mb-2 h-5 w-5 text-accent" />
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{desc}</p>
    </div>
  );
}
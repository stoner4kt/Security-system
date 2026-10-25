"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type { Guard } from "@/lib/supabase/types";

/** Subscribe to the auth state once; returns session + user + guard profile. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [guard, setGuard] = useState<Guard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let cancel = false;

    async function fetchProfile(uid: string | undefined) {
      if (!uid) {
        setGuard(null);
        setUser(null);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("guards")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (!cancel) {
        if (!error && data) setGuard(data);
        setLoading(false);
      }
      if (error) console.error("guard profile fetch failed", error);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancel) return;
      setUser(data.session?.user ?? null);
      fetchProfile(data.session?.user?.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      fetchProfile(session?.user?.id);
    });

    return () => {
      cancel = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isStaff = guard?.role === "admin" || guard?.role === "dispatcher";
  return { user, guard, loading, isStaff };
}
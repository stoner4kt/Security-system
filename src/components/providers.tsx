"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/** Client-side providers. Detects auth session so pages can gate content. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;
    supabase.auth.getSession().then(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return children;
}
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { useAuth } from "@/lib/hooks/use-auth";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="dark-shell flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  return (
    <div className="dark-shell flex min-h-dvh w-full">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="min-w-0 flex-1 p-0 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, LogIn, Eye, EyeOff } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Route to duty by default; staff usually end up on the dashboard.
    router.replace("/duty");
  }

  async function handleDemo(e: React.MouseEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? "admin@sentinel.test",
      password: process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD ?? "sentinel-admin-2026",
    });
    if (error) {
      setError("Demo account not provisioned. Create a user in Supabase Auth first.");
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="dark-shell flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 shadow-lg shadow-blue-900/40">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Sentinel Fleet</h1>
            <p className="text-sm text-slate-400">Security Patrol Operations</p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/95 shadow-xl backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>Access the operations console or your duty view.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                <LogIn className="h-4 w-4" />
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm">
              <Link href="/register" className="font-medium text-accent hover:underline">
                Create account
              </Link>
              <button
                type="button"
                onClick={handleDemo}
                className="font-medium text-slate-500 hover:text-slate-700"
              >
                Demo sign-in
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          Protected by Row Level Security · Supabase Auth
        </p>
      </div>
    </div>
  );
}
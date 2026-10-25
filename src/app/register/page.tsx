"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, UserPlus } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [badge, setBadge] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabase();

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, badge_number: badge || null },
      },
    });

    if (signUpErr || !data.user) {
      setError(signUpErr?.message ?? "Sign up failed");
      setLoading(false);
      return;
    }

    // Ensure the guards profile row exists (RLS lets the owner insert).
    const { error: profileErr } = await supabase.from("guards").insert({
      id: data.user.id,
      full_name: fullName,
      badge_number: badge || null,
      role: "guard", // guards are never self-promoted; an admin promotes via dashboard/SQL
    });

    if (profileErr) {
      console.warn("profile row may already exist:", profileErr.message);
    }

    router.replace("/duty");
  }

  return (
    <div className="dark-shell flex min-h-dvh items-center justify-center px-4 py-8">
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
            <CardTitle className="text-lg">Create your guard account</CardTitle>
            <CardDescription>
              You&apos;ll be assigned a role by an administrator after sign-up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="badge">Badge number (optional)</Label>
                <Input
                  id="badge"
                  placeholder="G-1042"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                />
              </div>
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
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                <UserPlus className="h-4 w-4" />
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm">
              Already registered?{" "}
              <Link href="/login" className="font-medium text-accent hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
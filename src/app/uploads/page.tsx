"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileImage } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CloudinaryUploader } from "@/components/uploads/cloudinary-uploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabase } from "@/lib/supabase/client";
import type { VehicleDocument } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";

export default function UploadsPage() {
  const [docs, setDocs] = useState<VehicleDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await getSupabase()
        .from("vehicles_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!mounted) return;
      if (!error) setDocs(data ?? []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DashboardShell>
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-4 lg:grid-cols-2 lg:px-0 lg:py-0">
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-bold text-white">Photo & Document Uploads</h1>
            <p className="text-sm text-slate-400">
              Damage photos and licence documents go straight to Cloudinary; the
              secure URL is stored in Supabase.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Upload to Cloudinary</CardTitle>
              <CardDescription>
                Snap or choose a photo from your device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CloudinaryUploader />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent documents</CardTitle>
            <CardDescription>Stored securely in Cloudinary.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No documents uploaded yet.
              </p>
            ) : (
              <div className="space-y-2">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-2.5"
                  >
                    <a href={d.url} target="_blank" rel="noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={d.url}
                        alt={d.title}
                        className="h-14 w-20 rounded-md object-cover"
                        loading="lazy"
                      />
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(d.created_at)}
                        {d.bytes ? ` · ${(d.bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{d.doc_type}</Badge>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Open image"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="mx-auto mt-2 max-w-5xl px-4 text-center text-[11px] text-slate-500 lg:text-left">
        <FileImage className="mr-1 inline h-3 w-3" />
        Media hosted by Cloudinary — optimized delivery &amp; secure HTTPS by default.
      </p>
    </DashboardShell>
  );
}
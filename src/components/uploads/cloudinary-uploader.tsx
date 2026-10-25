"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, CloudUpload, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/hooks/use-auth";
import { getSupabase } from "@/lib/supabase/client";

const DOC_TYPES = [
  { value: "inspection", label: "Vehicle inspection" },
  { value: "damage", label: "Damage photo" },
  { value: "insurance", label: "Insurance" },
  { value: "license", label: "Licence" },
  { value: "permit", label: "Permit" },
  { value: "other", label: "Other" },
];

/** Client-side Cloudinary uploader.
 *
 * Production: calls the `cloudinary-sign` edge function for a signed payload,
 * then POSTs the image to Cloudinary. For quick local setup it falls back to
 * an unsigned upload preset (a preset is not a secret — the API secret never
 * leaves the server).
 */
export function CloudinaryUploader() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("inspection");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
  const unsignedPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

  const chooseFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setDone(false);
    setCloudUrl(null);
    setPreview(URL.createObjectURL(f));
  }, []);

  /** POST the file to Cloudinary. Tries the signed path first (via the edge
   *  function), falls back to the unsigned preset if not configured yet. */
  async function uploadToCloudinary(f: File): Promise<{ url: string; publicId: string }> {
    if (!cloudName) throw new Error("Cloudinary cloud name not configured");

    for (const mode of ["signed", "unsigned"] as const) {
      const form = new FormData();
      form.append("file", f);

      if (mode === "signed") {
        try {
          const session = await getSupabase().auth.getSession();
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cloudinary-sign`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.data.session?.access_token ?? ""}`,
              },
              body: JSON.stringify({ folder: "sentinel-fleet/photos" }),
            },
          );
          if (!res.ok) continue;
          const data = (await res.json()) as {
            signature: string;
            timestamp: number;
            api_key: string;
            folder: string;
          };
          form.append("folder", data.folder);
          form.append("timestamp", String(data.timestamp));
          form.append("api_key", data.api_key);
          form.append("signature", data.signature);
        } catch {
          continue;
        }
      } else {
        if (!unsignedPreset) continue;
        form.append("upload_preset", unsignedPreset);
        form.append("folder", "sentinel-fleet/photos");
      }

      const up = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: form,
      });
      const j = (await up.json()) as {
        secure_url?: string;
        public_id?: string;
        error?: { message: string };
      };
      if (up.ok && j.secure_url && j.public_id) {
        return { url: j.secure_url, publicId: j.public_id };
      }
    }

    throw new Error(
      "Image upload failed. Configure the cloudinary-sign edge function or an unsigned upload preset.",
    );
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(20);
    try {
      const { url, publicId } = await uploadToCloudinary(file);
      setProgress(60);
      setCloudUrl(url);

      setSaving(true);
      const { error: dbErr } = await getSupabase().from("vehicles_documents").insert({
        guard_id: user?.id ?? null,
        title: title || file.name,
        doc_type: docType,
        url,
        public_id: publicId,
        format: file.type.split("/")[1] ?? null,
        bytes: file.size,
        notes: notes || null,
      });
      setSaving(false);
      if (dbErr) {
        setError(`Uploaded to Cloudinary, but saving to the database failed: ${dbErr.message}`);
      } else {
        setDone(true);
      }
      setProgress(100);
      setTimeout(() => setProgress(0), 900);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setCloudUrl(null);
    setDone(false);
    setTitle("");
    setNotes("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      {/* Preview / drop zone / success */}
      {done ? (
        <div className="rounded-lg border border-emerald-300/40 bg-emerald-50 p-4 text-center">
          <p className="mb-3 text-sm font-medium text-emerald-800">✓ Saved to Cloudinary</p>
          {cloudUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic Cloudinary URL, next/image would need remote loader config
            <img
              src={cloudUrl}
              alt="Uploaded document"
              className="mx-auto mb-3 max-h-40 rounded-md object-cover"
            />
          )}
          <Button variant="outline" size="sm" onClick={reset}>
            Upload another
          </Button>
        </div>
      ) : preview ? (
        <div className="relative overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Preview"
            className="aspect-video w-full object-cover"
          />
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
            onClick={() => {
              setPreview(null);
              setFile(null);
            }}
            aria-label="Remove preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition hover:border-accent hover:bg-muted/40"
        >
          <CloudUpload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Tap to browse or drop a photo</p>
            <p className="text-xs text-muted-foreground">
              Vehicle damage, inspection, licence or permit document
            </p>
          </div>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="utitle">Title</Label>
          <Input
            id="utitle"
            placeholder="e.g. Front bumper damage"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Document type</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="unotes">Notes</Label>
        <Textarea
          id="unotes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional context for the admin"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {progress > 0 && progress < 100 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => cameraRef.current?.click()}>
          <Camera className="h-4 w-4" /> Take photo
        </Button>
        <Button className="flex-1" onClick={handleUpload} disabled={!file || uploading || saving}>
          {uploading || saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {saving ? "Saving to database…" : "Uploading…"}
            </>
          ) : (
            <>
              <Paperclip className="h-4 w-4" /> Upload to Cloudinary
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
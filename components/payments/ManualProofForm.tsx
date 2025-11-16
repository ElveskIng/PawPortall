"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { v4 as uuidv4 } from "uuid";
import { useMemo } from "react";

type Proof = {
  id: string;
  image_url: string;
  amount: number;
  reference?: string | null;
  status: "pending" | "approved" | "rejected";
  notes?: string | null;
  created_at: string;
};

export default function ManualProofForm() {
  const supa = useMemo(() => getSupabaseBrowserClient(), []);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([]);

  async function loadProofs() {
    const r = await fetch("/api/payment-proofs", { cache: "no-store" });
    const j = await r.json();
    setProofs(j || []);
  }

  useEffect(() => { loadProofs(); }, []);

  async function uploadImage(): Promise<string> {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) throw new Error("Not logged in");
    if (!file) throw new Error("Attach your screenshot");

    const path = `${user.id}/${uuidv4()}.jpg`;
    const { error } = await supa.storage.from("payment_proofs").upload(path, file, {
      upsert: false,
      cacheControl: "3600",
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;

    const { data } = supa.storage.from("payment_proofs").getPublicUrl(path);
    return data.publicUrl;
  }

  async function submit() {
    if (!file) { alert("Please attach your payment screenshot."); return; }
    if (!amount) { alert("Please enter amount (PHP)."); return; }

    setSubmitting(true);
    try {
      const image_url = await uploadImage();
      const r = await fetch("/api/payment-proofs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url, amount: Number(amount), reference }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Submit failed");
      setFile(null); setAmount(""); setReference("");
      await loadProofs();
      alert("Submitted! Please wait for admin approval.");
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  const qrSrc = process.env.NEXT_PUBLIC_GCASH_QR_URL || "/gcash-qr.png";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 p-4 flex items-center gap-4">
        <img src={qrSrc} alt="GCash QR" className="w-32 h-32 rounded-lg object-contain" />
        <div className="text-sm opacity-90">
          <div className="font-medium">Pay via GCash QR</div>
          <div>After paying, upload your screenshot and (optional) reference no.</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2">
            <span className="block text-sm mb-1">Payment screenshot</span>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label>
            <span className="block text-sm mb-1">Amount (PHP)</span>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-transparent border rounded px-3 py-2"
              placeholder="e.g. 49"
            />
          </label>
        </div>
        <label>
          <span className="block text-sm mb-1">Reference number (optional)</span>
          <input
            value={reference}
            onChange={e => setReference(e.target.value)}
            className="w-full bg-transparent border rounded px-3 py-2"
            placeholder="GCash Ref #"
          />
        </label>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit proof"}
        </button>
      </div>

      <div className="rounded-xl border border-white/10 p-4">
        <div className="font-medium mb-2">Your submissions</div>
        <div className="space-y-3">
          {proofs.length === 0 && <div className="text-sm opacity-70">No proofs yet.</div>}
          {proofs.map(p => (
            <div key={p.id} className="flex items-center gap-3">
              <img src={p.image_url} className="w-16 h-16 rounded object-cover border border-white/10" />
              <div className="text-sm">
                <div>
                  ₱{Number(p.amount).toFixed(2)} •{" "}
                  <span className={
                    p.status === "approved" ? "text-emerald-400" :
                    p.status === "rejected" ? "text-rose-400" : "text-amber-300"
                  }>
                    {p.status}
                  </span>
                </div>
                {p.reference ? <div className="opacity-70">Ref: {p.reference}</div> : null}
                <div className="opacity-60 text-xs">{new Date(p.created_at).toLocaleString()}</div>
                {p.notes ? <div className="opacity-80">Notes: {p.notes}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

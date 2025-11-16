"use client";

import { useEffect, useRef, useState } from "react";
import { useMemo } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Proof = {
  id: string;
  image_url: string;
  status: "pending" | "approved" | "rejected";
  reference?: string | null;
  notes?: string | null;
  created_at: string;
  amount?: number | null;
};

const FIXED_PRICE = 20; // ₱20 = 1 credit
const ALLOWED_AMOUNTS = [20, 40, 60, 80, 100] as const;

function clampToAllowed(n: number): number {
  if (!Number.isFinite(n)) return ALLOWED_AMOUNTS[0];
  if (n <= 20) return 20;
  if (n >= 100) return 100;
  const k = Math.round(n / 20) * 20;
  return ALLOWED_AMOUNTS.includes(k as any) ? k : 20;
}

export default function AddPetPaymentBlock() {
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");

  const [amountInput, setAmountInput] = useState<string>("20");

  const [submitting, setSubmitting] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogBody, setDialogBody] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [agree, setAgree] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qrSrc = process.env.NEXT_PUBLIC_GCASH_QR_URL || "/gcash-qr.png";

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const userIdRef = useRef<string | null>(null);

  function openDialog(title: string, body: string) {
    setDialogTitle(title);
    setDialogBody(body);
    setDialogOpen(true);
  }

  // ✅ loadProofs with optional "silent" flag (no loading text)
  async function loadProofs(options?: { silent?: boolean }) {
    if (!options?.silent) setLoading(true);
    try {
      const r = await fetch("/api/payment-proofs", { cache: "no-store" });
      const j = (await r.json()) as any;
      if (Array.isArray(j)) {
        setProofs(j as Proof[]);
      }
    } catch {
      // ignore, just don't crash UI
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }

  const hasPending = proofs.some((p) => p.status === "pending");

  // initial load + realtime + silent polling
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const setup = async () => {
      // first load: show Loading...
      await loadProofs();
      if (cancelled) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const currentUserId = user?.id || null;
      userIdRef.current = currentUserId;

      if (!currentUserId) return;

      channel = supabase
        .channel("payment-proofs-user-" + currentUserId)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "payment_proofs",
            filter: `user_id=eq.${currentUserId}`,
          },
          async () => {
            // silent refresh on realtime events
            await loadProofs({ silent: true });
          }
        )
        .subscribe();

      // small silent polling fallback
      interval = setInterval(() => {
        void loadProofs({ silent: true });
      }, 3000);
    };

    void setup();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountNumber = clampToAllowed(
    Number(String(amountInput).replace(/[^0-9.]/g, ""))
  );
  const computedCredits = Math.floor(amountNumber / FIXED_PRICE);

  function onAmountChange(v: string) {
    setAmountInput(v);
  }
  function onAmountBlur() {
    setAmountInput(String(amountNumber));
  }

  function onClickSubmit() {
    if (hasPending) {
      openDialog(
        "Pending payment",
        "You already have a payment submission that is still pending review. " +
          "Please wait for the admin to approve or reject it before sending a new one."
      );
      return;
    }

    if (!file) {
      openDialog("Missing file", "Please select a payment screenshot image.");
      return;
    }
    setAmountInput(String(amountNumber));
    setAgree(false);
    setConfirmSubmitOpen(true);
  }

  async function doSubmit() {
    try {
      setSubmitting(true);

      const normalizedAmount = amountNumber;

      const form = new FormData();
      form.append("amount", String(normalizedAmount));
      if (reference.trim()) form.append("reference", reference.trim());
      form.append("image", file as Blob);

      const r = await fetch("/api/payment-proofs", {
        method: "POST",
        body: form,
      });
      const text = await r.text().catch(() => "");
      if (!r.ok) {
        openDialog(
          "Submit failed",
          text || "Your proof could not be submitted. Please try again."
        );
        return;
      }

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setReference("");
      setAmountInput("20");

      // after submit we can show loader quickly (non-silent)
      await loadProofs();
      openDialog(
        "Submitted",
        "Thanks! Your proof is now pending review by an admin."
      );
    } catch (e: any) {
      openDialog("Submit failed", String(e?.message || e) || "Unexpected error.");
    } finally {
      setSubmitting(false);
      setConfirmSubmitOpen(false);
    }
  }

  function confirmRemove(id: string) {
    setConfirmId(id);
    setConfirmOpen(true);
  }

  async function actuallyRemove() {
    if (!confirmId) return;
    try {
      const r = await fetch(
        `/api/payment-proofs?id=${encodeURIComponent(confirmId)}`,
        {
          method: "DELETE",
        }
      );
      const text = await r.text().catch(() => "");
      if (!r.ok) {
        openDialog(
          "Delete failed",
          text || "Couldn’t delete this proof."
        );
        return;
      }
      await loadProofs();
      openDialog("Removed", "The rejected proof has been deleted.");
    } catch (e: any) {
      openDialog("Delete failed", String(e?.message || e) || "Unexpected error.");
    } finally {
      setConfirmOpen(false);
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* QR block */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            title="Zoom QR"
            className="rounded-2xl ring-1 ring-indigo-200 hover:ring-2 hover:ring-indigo-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="GCash QR"
              className="h-56 w-56 md:h-72 md:w-72 object-contain rounded-2xl cursor-zoom-in bg-white"
              loading="lazy"
            />
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-indigo-900/80">
          Tap the QR to zoom (base rate: ₱{FIXED_PRICE}.00 per credit for one Month only).
        </p>
        <p className="mt-1 text-center text-sm font-medium text-gray-800">
          GCash number: <span className="tracking-wide">0955 922 5286</span>
        </p>
      </div>

      {/* Upload + fields */}
      <div className="rounded-2xl border border-gray-200 bg-white/70 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Payment screenshot
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Payment amount (₱)
            </label>
            <input
              type="number"
              step={20}
              min={20}
              max={100}
              value={amountInput}
              onChange={(e) => onAmountChange(e.target.value)}
              onBlur={onAmountBlur}
              className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="mt-1 text-[11px] text-gray-500">
              Allowed values: 20, 40, 60, 80, 100 (max per week).
            </div>
            <div className="mt-0.5 text-xs text-gray-700">
              Estimated credits:{" "}
              <span className="font-medium">{computedCredits}</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Reference number
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="GCash#"
              className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="md:col-span-2">
            <button
              onClick={onClickSubmit}
              disabled={!file || submitting || hasPending}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-50"
            >
              {hasPending
                ? "Waiting for admin review…"
                : submitting
                ? "Submitting..."
                : "Submit proof"}
            </button>
            {hasPending && (
              <p className="mt-1 text-xs text-amber-700">
                You currently have a payment that is still <b>pending</b>. You can
                submit a new proof once the admin approves or rejects it.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Submissions list */}
      <div className="rounded-2xl border border-gray-200 bg-white/70 p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">
          Your submissions
        </div>
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : proofs.length === 0 ? (
          <div className="text-sm text-gray-500">No proofs yet.</div>
        ) : (
          <ul className="space-y-2">
            {proofs.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-2"
              >
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt="proof"
                    className="h-10 w-10 rounded-md object-cover ring-1 ring-gray-200"
                  />
                  <div className="text-sm">
                    <div className="font-medium">
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                    <div className="text-gray-500">
                      Ref: {p.reference || "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 capitalize " +
                      (p.status === "approved"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : p.status === "rejected"
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200")
                    }
                  >
                    {p.status}
                  </span>

                  {p.status === "rejected" && (
                    <button
                      aria-label="Remove rejected proof"
                      onClick={() => confirmRemove(p.id)}
                      className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      title="Remove this rejected proof"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* dialogs and QR modal — unchanged */}
      {dialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold">{dialogTitle}</div>
            <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
              {dialogBody}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                onClick={() => setDialogOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold">
              Remove this rejected proof?
            </div>
            <p className="mt-2 text-sm text-gray-700">
              This will permanently delete the rejected submission from your
              list.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmId(null);
                }}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700"
                onClick={actuallyRemove}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-[115] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold">Confirm payment details</div>

            <div className="mt-3 space-y-1 text-sm">
              <div>
                <span className="font-medium">Payment amount:</span> ₱
                {amountNumber.toFixed(2)}
              </div>
              <div>
                <span className="font-medium">Reference #:</span>{" "}
                {reference || "—"}
              </div>
            </div>

            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Please double-check the amount. The credits you receive will be
              based only on the amount you entered (₱20 = 1 credit, capped at 5
              per week). Entering a wrong or excessive amount may be treated as
              abuse and{" "}
              <span className="font-semibold">
                can lead to account suspension
              </span>
              .
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              I understand and confirm these details are correct.
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                onClick={() => setConfirmSubmitOpen(false)}
              >
                Cancel
              </button>
              <button
                disabled={!agree || submitting}
                onClick={doSubmit}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrOpen && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-[90vw] rounded-2xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                aria-label="Close"
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="GCash QR (zoomed)"
              className="h-auto w-full max-w-[80vw] rounded-xl object-contain"
            />
            <p className="mt-2 text-center text-sm font-medium text-gray-800">
              GCash number:{" "}
              <span className="tracking-wide">0955 922 5286</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

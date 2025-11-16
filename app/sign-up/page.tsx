// app/sign-up/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

export default function SignUpPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const search = useSearchParams();
  // We’ll still read ?next= if you ever want to override,
  // but we’ll FORCE /profile after OTP verify below.
  const next = search.get("next") || "/profile";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  // OTP flow state
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (awaitingOtp && resendCooldown === 0) setResendCooldown(30);
  }, [awaitingOtp, resendCooldown]);

  useEffect(() => {
    if (!resendCooldown) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Terms modal state
  const [showTerms, setShowTerms] = useState(false);
  const [agree, setAgree] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<{
    fullName: string;
    email: string;
    password: string;
  } | null>(null);

  // After signUp, rely on Email OTP (6-digit code) to verify in-place.
  async function actuallySignUp(payload: { fullName: string; email: string; password: string }) {
    try {
      setStatus({ type: "loading", message: "Creating your account…" });

      const { error } = await supabase.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: { full_name: payload.fullName },
          // No emailRedirectTo needed for OTP flow
        },
      });

      if (error) throw error;

      setStatus({
        type: "success",
        message: "We sent a 6-digit code to your email. Enter it below to verify.",
      });
      setAwaitingOtp(true);
      setResendCooldown(30);
    } catch (err: any) {
      setStatus({ type: "error", message: err?.message || "Sign up failed. Please try again." });
    } finally {
      setShowTerms(false);
      setAgree(false);
      setPendingPayload(null);
    }
  }

  // Verify the 6-digit OTP and finish login → ALWAYS go to /profile
  async function verifyOtpAndLogin() {
    try {
      setStatus({ type: "loading", message: "Verifying code…" });

      const { error } = await supabase.auth.verifyOtp({
        type: "signup",
        email,
        token: otp.trim(),
      });

      if (error) throw error;

      setStatus({ type: "success", message: "Email verified! Redirecting…" });
      router.replace("/profile"); // <<< force profile, not dashboard
    } catch (err: any) {
      setStatus({
        type: "error",
        message: err?.message || "Invalid or expired code. Please try again.",
      });
    }
  }

  // Resend code
  async function resendCode() {
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setStatus({ type: "success", message: "New code sent. Please check your inbox." });
      setResendCooldown(30);
    } catch (err: any) {
      setStatus({ type: "error", message: err?.message || "Could not resend code right now." });
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (awaitingOtp) return;
    setStatus({ type: "idle" });

    // open the modal first; we will only call supabase after accept
    setPendingPayload({ fullName, email, password });
    setShowTerms(true);
  }

  function onAcceptTerms() {
    if (!agree || !pendingPayload) return;
    actuallySignUp(pendingPayload);
  }

  function onDeclineTerms() {
    setShowTerms(false);
    setAgree(false);
    setPendingPayload(null);
    setStatus({
      type: "error",
      message: "You must accept the Terms & Conditions to create an account.",
    });
  }

  return (
    <main className="min-h-[70vh] flex items-start md:items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white/90 shadow-xl ring-1 ring-black/5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Full name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="Juan Dela Cruz"
              disabled={awaitingOtp}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="you@example.com"
              disabled={awaitingOtp}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Password</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="••••••••"
              minLength={6}
              disabled={awaitingOtp}
            />
          </div>

          {/* OTP input section (shown after we send the code) */}
          {awaitingOtp && (
            <div className="mt-2 rounded-lg border border-zinc-200 p-3 bg-zinc-50">
              <label className="block text-sm font-medium text-zinc-700">
                Enter the 6-digit code we emailed you
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 tracking-widest text-center text-lg outline-none focus:ring-2 focus:ring-fuchsia-500"
                placeholder="• • • • • •"
              />

              <div className="mt-2 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={verifyOtpAndLogin}
                  className="rounded-lg bg-emerald-600 text-white px-3 py-2 font-medium hover:bg-emerald-700 disabled:opacity-50"
                  disabled={otp.length !== 6 || status.type === "loading"}
                >
                  Verify & continue
                </button>

                <button
                  type="button"
                  onClick={resendCode}
                  className="text-fuchsia-700 underline disabled:opacity-50"
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            </div>
          )}

          {status.type !== "idle" && (
            <p
              className={
                "text-sm " +
                (status.type === "error"
                  ? "text-red-600"
                  : status.type === "success"
                  ? "text-emerald-700"
                  : "text-zinc-600")
              }
            >
              {status.message}
            </p>
          )}

          {!awaitingOtp && (
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 text-white font-medium py-2 hover:bg-emerald-700 active:scale-[.99] transition disabled:opacity-50"
              disabled={status.type === "loading"}
            >
              {status.type === "loading" ? "Please wait…" : "Sign up"}
            </button>
          )}

          <p className="text-sm text-zinc-600">
            Already have an account?{" "}
            <Link href={`/sign-in?next=${encodeURIComponent("/profile")}`} className="underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>

      {/* TERMS & CONDITIONS MODAL */}
      {showTerms && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
              <div className="px-6 py-4 rounded-t-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white">
                <h2 className="text-lg font-semibold">Terms & Conditions</h2>
                <p className="text-white/90 text-xs">Please read and agree to continue.</p>
              </div>

              <div className="px-6 py-4">
                {/* Scrollable content */}
                <div className="max-h-72 overflow-y-auto pr-2 text-[14px] leading-6 text-zinc-800 space-y-4">
                  <p>
                    Welcome to <strong>PawPortal</strong>. By creating an account, you agree to use
                    the platform responsibly and comply with these Terms. PawPortal is a bridging
                    service that connects pet owners and adopters in support of ethical, humane pet
                    rehoming in the Philippines.
                  </p>

                  <ol className="list-decimal pl-5 space-y-2">
                    <li>
                      <strong>Accurate Information.</strong> Provide truthful details in your profile
                      and listings. Misleading, abusive, or harmful content may lead to suspension or
                      permanent ban.
                    </li>
                    <li>
                      <strong>Lawful Use.</strong> Follow Philippine laws, LGU regulations, and the
                      Animal Welfare Act. No harassment, scams, or animal cruelty.
                    </li>
                    <li>
                      <strong>Listings & Photos.</strong> Pet listings must represent real animals.
                      We may remove content that violates policies.
                    </li>
                    <li>
                      <strong>No Guarantees.</strong> PawPortal does not guarantee a pet’s health,
                      behavior, or suitability. Meet responsibly and verify information.
                    </li>
                    <li>
                      <strong>Privacy.</strong> Personal data is processed per our{" "}
                      <Link href="/privacy" className="underline">Privacy Policy</Link>. We don’t sell your data.
                    </li>
                    <li>
                      <strong>Updates.</strong> Terms may change. Continued use means acceptance of
                      updates posted on <Link href="/terms" className="underline">/terms</Link>.
                    </li>
                  </ol>

                  <p className="text-sm text-zinc-600">
                    Full text available at <Link href="/terms" className="underline">pawportal • terms</Link>.
                  </p>
                </div>

                {/* Agree checkbox */}
                <label className="mt-4 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-fuchsia-600 focus:ring-fuchsia-600"
                  />
                  <span className="text-sm text-zinc-800">
                    I have read and agree to the PawPortal{" "}
                    <Link href="/terms" className="underline">Terms & Conditions</Link> and{" "}
                    <Link href="/privacy" className="underline">Privacy Policy</Link>.
                  </span>
                </label>
              </div>

              <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-3">
                <button
                  onClick={onDeclineTerms}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  onClick={onAcceptTerms}
                  disabled={!agree || status.type === "loading"}
                  className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-emerald-700"
                >
                  {status.type === "loading" ? "Processing…" : "Accept & Create account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

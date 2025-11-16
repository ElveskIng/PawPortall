"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PawPrint,
  Shield,
  LogIn,
  LogOut,
  User2,
  Menu,
  X,
  Moon,
  SunMedium,
  User as UserIcon,
  Bell, // 🔔 for admin payments
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import NotificationBell from "@/components/NotificationBell";
import { useTheme } from "next-themes";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

/** ───────────────── Types ───────────────── */
type Role = "user" | "admin" | "";

type Profile = {
  role: Role | null;
  full_name: string | null;
  avatar_url: string | null;
};

/** ───────────────── Navbar ───────────────── */
export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const { theme, setTheme } = useTheme();

  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarV, setAvatarV] = useState(0);

  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const pill =
    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-white/40";
  const pillGhost = `${pill} text-white/90 hover:bg-white/10 hover:text-white`;
  const pillLight = `${pill} bg-white/10 text-white backdrop-blur border border-white/15 hover:bg-white/15`;
  const brand =
    "flex items-center gap-2 font-semibold text-white hover:opacity-95";

  const initials =
    (displayName?.split(" ").map((s) => s[0]).slice(0, 2).join("") ||
      user?.email?.[0] ||
      "U").toUpperCase();

  const avatarSrc = avatarUrl
    ? `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${avatarV}`
    : null;

  /** Load user + profile and listen to auth changes */
  useEffect(() => {
    let mounted = true;

    const loadUserAndProfile = async (): Promise<void> => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes?.user ?? null;
      if (!mounted) return;

      setUser(u);

      if (u) {
        const { data: profRow } = await supabase
          .from("profiles")
          .select("role, full_name, avatar_url")
          .eq("id", u.id)
          .single();

        const p = (profRow ?? null) as Profile | null;

        setDisplayName(p?.full_name ?? null);
        setRole((p?.role as Role | undefined) ?? "user");
        setAvatarUrl(p?.avatar_url ?? null);
      } else {
        setDisplayName(null);
        setRole("");
        setAvatarUrl(null);
      }
    };

    void loadUserAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_evt: AuthChangeEvent, session: Session | null) => {
        const u = session?.user ?? null;
        setUser(u);

        if (u) {
          void (async () => {
            const { data: profRow } = await supabase
              .from("profiles")
              .select("role, full_name, avatar_url")
              .eq("id", u.id)
              .single();

            const p = (profRow ?? null) as Profile | null;

            setDisplayName(p?.full_name ?? null);
            setRole((p?.role as Role | undefined) ?? "user");
            setAvatarUrl(p?.avatar_url ?? null);
            setAvatarV((v) => v + 1);
          })();
        } else {
          setDisplayName(null);
          setRole("");
          setAvatarUrl(null);
        }

        router.refresh();
      }
    );

    // avatar refresh via localStorage flag
    const onStorage = async (e: StorageEvent) => {
      if (e.key !== "pp:avatarUpdated") return;

      const { data: userRes } = await supabase.auth.getUser();
      const currentUser = userRes?.user;
      if (!currentUser) return;

      const { data: avatarRow } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", currentUser.id)
        .single();

      const p = (avatarRow ?? null) as Pick<Profile, "avatar_url"> | null;
      setAvatarUrl(p?.avatar_url ?? null);
      setAvatarV((v) => v + 1);
    };

    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [supabase, router]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /** Logout */
  const handleSignOut = async (): Promise<void> => {
    try {
      await fetch("/auth/signout", { method: "POST", cache: "no-store" });
    } catch {}
    try {
      await supabase.auth.signOut();
    } catch {}

    setUser(null);
    setDisplayName(null);
    setRole("");
    setAvatarUrl(null);
    setOpen(false);
    setMenuOpen(false);

    window.location.replace("/");
  };

  const isAdmin = role === "admin";

  return (
    <nav className="sticky top-0 z-50 w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 shadow-[0_10px_30px_-10px_rgba(99,102,241,0.5)]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex items-center justify-between py-3">
          {/* Brand */}
          <Link href="/" className={brand} onClick={() => setOpen(false)}>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20">
              <PawPrint className="h-5 w-5 text-white" />
            </span>
            <span className="tracking-tight">PawPortal</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-2 md:flex">
            {!isAdmin && (
              <>
                <Link
                  href="/"
                  className={isActive("/") ? pillLight : pillGhost}
                  aria-current={isActive("/") ? "page" : undefined}
                >
                  Home
                </Link>
                <Link
                  href="/about"
                  className={isActive("/about") ? pillLight : pillGhost}
                  aria-current={isActive("/about") ? "page" : undefined}
                >
                  About
                </Link>
                <Link
                  href="/newsfeed"
                  className={isActive("/newsfeed") ? pillLight : pillGhost}
                  aria-current={isActive("/newsfeed") ? "page" : undefined}
                >
                  Newsfeed
                </Link>
                <Link
                  href="/adopt"
                  className={isActive("/adopt") ? pillLight : pillGhost}
                  aria-current={isActive("/adopt") ? "page" : undefined}
                >
                  Adopt
                </Link>
              </>
            )}

            {user ? (
              <>
                {!isAdmin && (
                  <>
                    <Link href="/dashboard" className={pillLight}>
                      <User2 className="h-4 w-4" />
                      Account
                    </Link>
                    <NotificationBell />
                  </>
                )}

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/admin"
                      className="inline-flex items-center gap-2 rounded-xl bg-white text-violet-700 px-3 py-2 text-sm font-semibold hover:bg-violet-50 shadow-sm"
                    >
                      <Shield className="h-4 w-4" />
                      Admin
                    </Link>
                    <AdminPaymentsBell />
                  </div>
                )}

                {/* Avatar + dropdown */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Open user menu"
                    className="inline-grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-white/20 text-white ring-1 ring-white/25 hover:bg-white/25"
                  >
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={avatarSrc}
                        src={avatarSrc}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] font-bold">
                        {initials}
                      </span>
                    )}
                  </button>

                  <div
                    className={[
                      "absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-white/20 bg-white text-gray-900 shadow-xl",
                      "dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100",
                      menuOpen
                        ? "opacity-100 translate-y-0"
                        : "pointer-events-none opacity-0 -translate-y-1",
                      "transition",
                    ].join(" ")}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-black/5">
                        {avatarSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarSrc}
                            alt=""
                            className="h-9 w-9 object-cover"
                          />
                        ) : (
                          <div className="grid h-9 w-9 place-items-center bg-gray-100 text-xs font-bold">
                            {initials}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {displayName ?? "Your account"}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Theme: <span className="capitalize">{theme}</span>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-black/5 dark:bg-white/5" />

                    <div className="px-2 py-2 text-sm">
                      <Link
                        href="/profile"
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() => setMenuOpen(false)}
                      >
                        <UserIcon className="h-4 w-4" />
                        Profile
                      </Link>

                      <button
                        onClick={() => setTheme("dark")}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <Moon className="h-4 w-4" />
                        Dark
                      </button>
                      <button
                        onClick={() => setTheme("light")}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <SunMedium className="h-4 w-4" />
                        Light
                      </button>
                    </div>

                    <div className="h-px bg-black/5 dark:bg-white/5" />

                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-xl bg-white text-violet-700 px-3 py-2 text-sm font-semibold hover:bg-violet-50 shadow-sm"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </Link>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-white hover:bg-white/10"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation menu"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile nav */}
        {open && (
          <div className="md:hidden pb-4">
            <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
              {!isAdmin && (
                <>
                  <Link
                    href="/"
                    className={isActive("/") ? pillLight : pillGhost}
                    onClick={() => setOpen(false)}
                  >
                    Home
                  </Link>
                  <Link
                    href="/about"
                    className={isActive("/about") ? pillLight : pillGhost}
                    onClick={() => setOpen(false)}
                  >
                    About
                  </Link>
                  <Link
                    href="/newsfeed"
                    className={isActive("/newsfeed") ? pillLight : pillGhost}
                    onClick={() => setOpen(false)}
                  >
                    Newsfeed
                  </Link>
                  <Link
                    href="/adopt"
                    className={isActive("/adopt") ? pillLight : pillGhost}
                    onClick={() => setOpen(false)}
                  >
                    Adopt
                  </Link>
                </>
              )}

              {user ? (
                <>
                  {!isAdmin && (
                    <>
                      <Link
                        href="/dashboard"
                        className={pillLight}
                        onClick={() => setOpen(false)}
                      >
                        <User2 className="h-4 w-4" />
                        Dashboard
                      </Link>
                      <Link
                        href="/profile"
                        className={pillLight}
                        onClick={() => setOpen(false)}
                      >
                        <UserIcon className="h-4 w-4" />
                        Profile
                      </Link>
                      <div className="px-1">
                        <NotificationBell />
                      </div>
                    </>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <Link
                        href="/admin"
                        className="inline-flex items-center gap-2 rounded-xl bg-white text-violet-700 px-3 py-2 text-sm font-semibold hover:bg-violet-50 shadow-sm"
                        onClick={() => setOpen(false)}
                      >
                        <Shield className="h-4 w-4" />
                        Admin
                      </Link>
                      <AdminPaymentsBell />
                    </div>
                  )}

                  <div className="mt-1 grid grid-cols-2 gap-2 px-1">
                    <button
                      onClick={() => setTheme("dark")}
                      className="rounded-lg bg-white/10 px-2 py-2 text-white"
                    >
                      Dark
                    </button>
                    <button
                      onClick={() => setTheme("light")}
                      className="rounded-lg bg-white/10 px-2 py-2 text-white"
                    >
                      Light
                    </button>
                  </div>

                  <button
                    onClick={async () => {
                      await handleSignOut();
                      setOpen(false);
                    }}
                    className={pillGhost}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-violet-700 px-3 py-2 text-sm font-semibold hover:bg-violet-50 shadow-sm"
                  onClick={() => setOpen(false)}
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

/* ───────────────── Admin payment bell with dropdown ───────────────── */

type PaymentNotif = {
  id: string;
  amount: number | null;
  reference: string | null;
  created_at: string;
};

function AdminPaymentsBell() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [items, setItems] = useState<PaymentNotif[]>([]);
  const [open, setOpen] = useState(false);
  const [ping, setPing] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef<number | null>(null);

  const formatNotifDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-PH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // load pending + realtime
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, count, error } = await supabase
        .from("payment_proofs")
        .select("id, amount, reference, created_at, status", {
          count: "exact",
        })
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20); // load more, scroll will handle

      if (cancelled) return;

      if (error) {
        setPendingCount(0);
        setItems([]);
        return;
      }

      const newCount = count ?? 0;
      setPendingCount(newCount);
      setItems((data || []) as PaymentNotif[]);

      const prev = prevCountRef.current;
      prevCountRef.current = newCount;

      if (!open && prev !== null && newCount > prev) {
        setPing(true);
        setTimeout(() => setPing(false), 2000);
      }
    };

    void load();

    const channel = supabase
      .channel("admin-payment-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payment_proofs" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payment_proofs" },
        () => void load()
      )
      .subscribe();

    const interval = setInterval(() => {
      void load();
    }, 3000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [supabase, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const hasPending = (pendingCount ?? 0) > 0;
  if (!hasPending) return null;

  const badgeValue =
    pendingCount && pendingCount > 9 ? "9+" : String(pendingCount ?? 0);

  return (
    <div ref={boxRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "relative inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-sm",
          "hover:bg-violet-50",
          ping
            ? "ring-2 ring-rose-400/80 ring-offset-2 ring-offset-violet-600"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="New payment notifications"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 border-2 border-violet-600 text-[9px] font-semibold text-white">
          {badgeValue}
        </span>
      </button>

      {/* Dropdown */}
      <div
        className={[
          "absolute right-0 mt-2 w-80 rounded-2xl border border-black/5 bg-white text-gray-900 shadow-xl",
          "dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100",
          "transition origin-top-right",
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none",
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5">
          <div className="text-sm font-semibold">Notifications</div>
          <span className="rounded-full bg-amber-100 px-2 py-[2px] text-[11px] font-medium text-amber-700">
            {pendingCount} pending
          </span>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-4 text-xs text-gray-500">
            No pending payments.
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
            {items.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 text-xs hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer"
                onClick={() => {
                  router.push("/admin/payment-proofs");
                  setOpen(false);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-gray-900 dark:text-white">
                    New payment submitted
                  </div>
                  <div className="text-[11px] text-gray-500 text-right">
                    {formatNotifDateTime(p.created_at)}
                  </div>
                </div>
                <div className="mt-1 text-gray-700 dark:text-gray-200">
                  Amount: ₱{Number(p.amount || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-gray-500">
                  Ref: {p.reference || "—"}
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => {
            router.push("/admin/payment-proofs");
            setOpen(false);
          }}
          className="flex w-full items-center justify-center gap-2 border-t border-black/5 bg-gray-50 px-4 py-2.5 text-xs font-medium text-indigo-700 hover:bg-gray-100 dark:border-white/5 dark:bg-neutral-900 dark:text-indigo-300"
        >
          View all payments
        </button>
      </div>
    </div>
  );
}

// app/admin/payment-proofs/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import PaymentProofsRealtime from "./realtime";
import ProofImageZoom from "@/components/ProofImageZoom";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ───────────────── helpers to create clients ───────────────── */
function getServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* ignore on edge */
          }
        },
      },
    }
  );
}

/** service-role admin client (server only) */
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server only
  return createAdmin(url, key, { auth: { persistSession: false } });
}

/* ───────────────── SERVER ACTIONS (dito na mismo) ───────────────── */
async function approve(formData: FormData) {
  "use server";

  const id = (formData.get("id") || "").toString();
  const userId = (formData.get("user_id") || "").toString();
  const countRaw = (formData.get("count") || "0").toString();
  const creditsToGive = Math.max(0, Math.min(5, Number(countRaw) || 0));

  if (!id) return;

  const admin = getAdmin();

  // 1) update payment_proofs → approved
  await admin
    .from("payment_proofs")
    .update({ status: "approved" })
    .eq("id", id);

  // 2) dagdagan credits ng user (optional, pero eto gamit mo)
  if (userId && creditsToGive > 0) {
    // get current
    const { data: prof } = await admin
      .from("profiles")
      .select("listing_credits")
      .eq("id", userId)
      .single();

    const current = Number(prof?.listing_credits || 0);
    await admin
      .from("profiles")
      .update({ listing_credits: current + creditsToGive })
      .eq("id", userId);
  }

  // balik sa page
  redirect("/admin/payment-proofs");
}

async function reject(formData: FormData) {
  "use server";

  const id = (formData.get("id") || "").toString();
  if (!id) return;

  const admin = getAdmin();
  await admin
    .from("payment_proofs")
    .update({ status: "rejected" })
    .eq("id", id);

  redirect("/admin/payment-proofs");
}

/* ───────────────── types ───────────────── */
type ProofRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  status: "pending" | "approved" | "rejected" | string | null;
  reference: string | null;
  amount: number | null;
  created_at: string;
};

/* ───────────────── PAGE ───────────────── */
export default async function AdminPaymentProofsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // 1) check auth
  const supa = getServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect("/sign-in?next=/admin/payment-proofs");

  // 2) check kung admin
  const allowList =
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  const email = (user.email || "").toLowerCase();

  const { data: prof } = await supa
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  const allowed = Boolean(prof?.is_admin) || allowList.includes(email);
  if (!allowed) redirect("/");

  // pagination
  const page = Math.max(1, Number(qp(searchParams, "page") || 1));
  const pageSize = 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 3) fetch proofs via service client (may count)
  const admin = getAdmin();
  const { data, error, count } = await admin
    .from("payment_proofs")
    .select("id,user_id,image_url,status,reference,amount,created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <div className="space-y-6">
        <PaymentProofsRealtime />
        <h1 className="text-xl font-semibold">Payment Proofs</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          Failed to load proofs: {error.message}
        </div>
      </div>
    );
  }

  const proofs: ProofRow[] = (data as ProofRow[]) ?? [];
  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));

  // 4) resolve user names
  const userIds = Array.from(
    new Set(proofs.map((p) => p.user_id).filter(Boolean))
  );
  const userNameMap = await buildUserNameMap(admin, userIds);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Payment Proofs</h1>

      {proofs.length === 0 ? (
        <div className="text-sm text-gray-500">No submissions yet.</div>
      ) : (
        <>
          <ul className="space-y-3">
            {proofs.map((p) => {
              const displayName = userNameMap.get(p.user_id) ?? p.user_id;

              // preview credits from amount (same logic mo)
              const rawAmount = Number(p.amount || 0);
              const previewCredits = Math.min(
                Math.max(0, Math.floor(rawAmount / 20)),
                5
              );

              // IMPORTANT: wag lagi "rejected" ang default
              const safeStatus = (p.status || "pending").toLowerCase();

              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white/80 p-3"
                >
                  {/* left - image + info */}
                  <div className="flex items-center gap-3">
                    <ProofImageZoom
                      src={p.image_url || ""}
                      alt="Payment proof"
                      thumbClass="h-12 w-12 rounded-md object-cover ring-1 ring-gray-200 hover:ring-indigo-300 cursor-zoom-in"
                    />

                    <div className="text-sm">
                      <div className="font-medium">
                        {new Date(p.created_at).toLocaleString()} — ₱
                        {Number(p.amount || 0).toFixed(2)}
                        <span className="ml-2 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-[2px] text-[11px] text-gray-700">
                          Credits: {previewCredits}
                        </span>
                      </div>

                      <div className="text-gray-700">
                        User:&nbsp;
                        <a
                          href={`/users/${p.user_id}`}
                          className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
                          title={p.user_id}
                        >
                          {displayName}
                        </a>
                      </div>

                      <div className="text-gray-600">
                        Ref: {p.reference ? p.reference : "—"}
                      </div>
                    </div>
                  </div>

                  {/* right - status + actions */}
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 capitalize " +
                        (safeStatus === "approved"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : safeStatus === "rejected"
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200")
                      }
                    >
                      {safeStatus}
                    </span>

                    {safeStatus === "pending" && (
                      <>
                        <form action={approve} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="user_id" value={p.user_id} />
                          <input
                            type="hidden"
                            name="count"
                            value={previewCredits}
                          />
                          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700">
                            Approve (+ credits)
                          </button>
                        </form>

                        <form action={reject}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-700">
                            Reject
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

/* ───────────────── name resolution ───────────────── */
async function buildUserNameMap(
  admin: ReturnType<typeof getAdmin>,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const { data: profs } = await admin
    .from("profiles")
    .select("*")
    .in("id", userIds);

  const seen = new Set<string>();
  if (Array.isArray(profs)) {
    for (const o of profs) {
      const name = pickUserName(o);
      map.set(o.id, name || o.id);
      seen.add(o.id);
    }
  }

  const remaining = userIds.filter((id) => !seen.has(id));
  if (remaining.length) {
    const { data: users } = await admin
      .from("users")
      .select("*")
      .in("id", remaining);
    if (Array.isArray(users)) {
      for (const u of users) {
        const name = pickUserName(u);
        map.set(u.id, name || u.id);
      }
    }
  }

  return map;
}

function pickUserName(o: any): string {
  const firstLast = [o.first_name ?? o.firstname, o.last_name ?? o.lastname]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    (firstLast || undefined) ??
    o.full_name ??
    o.fullName ??
    o.display_name ??
    o.displayName ??
    o.name ??
    o.username ??
    o.handle ??
    o.email ??
    ""
  );
}

/* ───────────────── misc helpers ───────────────── */
function qp(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const mk = (p: number) => `/admin/payment-proofs?page=${p}`;

  const siblings = 1;
  const pages: (number | "...")[] = [];
  const left = Math.max(2, page - siblings);
  const right = Math.min(totalPages - 1, page + siblings);

  pages.push(1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages - 1) pages.push("...");
  if (totalPages > 1) pages.push(totalPages);

  const baseBtn =
    "rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 aria-disabled:opacity-50";
  const numBtn =
    "min-w-9 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50";
  const active =
    "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-600 hover:text-white";

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <a href={mk(Math.max(1, page - 1))} className={baseBtn} aria-disabled={page === 1}>
        Prev
      </a>

      {pages.map((p, idx) =>
        p === "..." ? (
          <span key={`dots-${idx}`} className="px-2 text-sm text-gray-500">
            …
          </span>
        ) : (
          <a
            key={p}
            href={mk(p)}
            aria-current={p === page ? "page" : undefined}
            className={[
              numBtn,
              p === page ? active : "border-gray-300 text-gray-700",
            ].join(" ")}
          >
            {p}
          </a>
        )
      )}

      <a
        href={mk(Math.min(totalPages, page + 1))}
        className={baseBtn}
        aria-disabled={page === totalPages}
      >
        Next
      </a>
    </div>
  );
}

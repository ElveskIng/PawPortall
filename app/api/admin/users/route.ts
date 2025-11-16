import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: Request) {
  const supabase = adminClient();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const roleFilter = (url.searchParams.get("role") || "all").toLowerCase();

  // 1) auth users
  const { data: listRes, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error("listUsers error", authErr);
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }

  const authUsers = listRes?.users ?? [];
  const userIds = authUsers.map((u) => u.id);

  // 2) profiles (KASAMA id_image_url)
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_suspended, created_at, id_image_url")
    .in("id", userIds);

  if (profErr) {
    console.error("profiles error", profErr);
    return NextResponse.json({ error: "Failed to load profiles." }, { status: 500 });
  }

  const profMap = new Map<string, any>((profiles ?? []).map((p) => [p.id, p]));

  // 3) merge
  let items = authUsers.map((u) => {
    const p = profMap.get(u.id) || null;
    const role = (p?.role as string | null) || "user";

    return {
      id: u.id,
      full_name: p?.full_name ?? null,
      email: u.email ?? null,
      role,
      is_verified: !!u.email_confirmed_at,
      is_suspended: !!p?.is_suspended,
      created_at: (u as any).created_at ?? p?.created_at ?? null,
      // 🔥 dito nanggagaling yung thumbnail sa admin table
      id_image_url: p?.id_image_url ?? null,
    };
  });

  // 4) alisin admins
  items = items.filter((row) => (row.role || "").toLowerCase() !== "admin");

  // 5) filter by role kung hindi "all"
  if (roleFilter !== "all") {
    items = items.filter((row) => (row.role || "").toLowerCase() === roleFilter);
  }

  // 6) search q
  if (q) {
    items = items.filter((row) => {
      const hay = `${row.full_name || ""} ${row.email || ""} ${row.id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  return NextResponse.json({ items }, { status: 200 });
}

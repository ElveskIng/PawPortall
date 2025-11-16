// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const path = url.pathname;

  const isAuthPage = path === "/sign-in" || path === "/sign-up";
  const hasSession =
    req.cookies.get("sb:token") || req.cookies.get("sb-access-token");

  // 👇 ALLOW static/public paths so CSS/JS/images are never redirected
  const allowStatic =
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path.startsWith("/images") ||
    path.startsWith("/assets") ||
    path.startsWith("/fonts") ||
    path.startsWith("/icons") ||
    path.startsWith("/robots.txt") ||
    path.startsWith("/sitemap.xml") ||
    path.startsWith("/manifest.json") ||
    path.startsWith("/site.webmanifest") ||
    path.startsWith("/opengraph-image") ||
    path === "/";

  // Prepare response for Supabase cookie handling
  const res = NextResponse.next();

  // Create a session-bound Supabase client in middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value;
        },
        set(name, value, options) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? null;
  }

  // If user hits auth pages and already has a session, route properly
  if (isAuthPage && hasSession) {
    url.pathname = role === "admin" ? "/admin" : "/dashboard";
    return NextResponse.redirect(url);
  }

  // ✅ Do NOT interfere with static/public/API requests
  if (allowStatic || path.startsWith("/api")) {
    return res;
  }

  // ───────── Admin routing rules ─────────
  if (user && role === "admin") {
    const isAdminSection = path.startsWith("/admin");
    const isUserProfile = path.startsWith("/users/"); // allow viewing user profiles

    // Keep admin inside /admin, BUT allow /users/[id] profile pages
    if (!isAdminSection && !isUserProfile) {
      const to = req.nextUrl.clone();
      to.pathname = "/admin";
      return NextResponse.redirect(to);
    }
    return res;
  }

  // ───────── Non-admin (or signed out): block /admin ─────────
  if (path.startsWith("/admin")) {
    const to = req.nextUrl.clone();
    to.pathname = "/";
    return NextResponse.redirect(to);
  }

  return res;
}

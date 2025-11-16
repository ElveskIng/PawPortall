// app/newsfeed/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send,
  User2,
  Clock,
  Trash2,
  X,
  UploadCloud,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { User, Session } from "@supabase/supabase-js";

/* ---------- Types ---------- */
type Post = {
  id: string;
  author_id: string;
  author_name: string | null;
  author_avatar_url: string | null;
  content: string | null;
  photo_url: string | null;
  likes_count: number | null;
  comments_count: number | null;
  created_at: string | null;
};

type Profile = { full_name: string | null; avatar_url: string | null };

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string | null;
  // augmented for display
  author_name?: string | null;
  author_avatar_url?: string | null;
};

const PAGE_SIZE = 10;
const BUCKET = "news_photos";

/* ---------- helpers ---------- */
function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(mo / 12);
  return `${y}y`;
}

/* Small helper to create a stable string key for posts list */
const idsKey = (arr: { id: string }[]) => arr.map((p) => p.id).join(",");

export default function NewsfeedPage() {
  const supabase = getSupabaseBrowserClient() as any;

  /* ---------- auth & profile ---------- */
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({ full_name: null, avatar_url: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const sess = (data?.session ?? null) as Session | null;
      const u = sess?.user ?? null;
      if (!mounted) return;
      setUser(u);

      if (u) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", u.id)
          .maybeSingle();
        setProfile({ full_name: p?.full_name ?? null, avatar_url: p?.avatar_url ?? null });
      } else {
        setProfile({ full_name: null, avatar_url: null });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  const initials = useMemo(() => {
    const s =
      profile.full_name?.split(" ").map((t) => t[0]).slice(0, 2).join("") ||
      user?.email?.[0] ||
      "U";
    return s.toUpperCase();
  }, [profile, user]);

  /* ---------- composer ---------- */
  const [content, setContent] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const postDisabled = posting || !user || content.trim().length === 0;

  const chooseFile = () => fileInputRef.current?.click();

  const handleFileChange = async (file?: File | null) => {
    if (!file || !user) return;
    try {
      setUploading(true);
      if (!file.type.startsWith("image/")) return alert("Please select an image.");
      if (file.size > 5 * 1024 * 1024) return alert("Max 5MB.");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) return alert("Upload failed.");

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) setPhotoUrl(pub.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const handlePost = async () => {
    if (postDisabled) return;
    setPosting(true);
    try {
      const payload = {
        author_id: (user as User).id,
        author_name: profile.full_name ?? "Someone",
        author_avatar_url: profile.avatar_url ?? null,
        content: content.trim(),
        photo_url: photoUrl.trim() || null,
      };

      const { data: row, error } = await supabase
        .from("news_posts")
        .insert([payload])
        .select(
          "id, author_id, author_name, author_avatar_url, content, photo_url, likes_count, comments_count, created_at"
        )
        .single();

      if (error) console.error(error);
      else setPosts((prev: Post[]) => [row as Post, ...prev]);

      setContent("");
      setPhotoUrl("");
    } finally {
      setPosting(false);
    }
  };

  /* ---------- feed ---------- */
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [end, setEnd] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // likes: track which posts I liked (persisted + loaded)
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());

  // comments modal
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from("news_posts")
          .select(
            "id, author_id, author_name, author_avatar_url, content, photo_url, likes_count, comments_count, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        if (ignore) return;

        if (error) {
          console.error(error);
          setPosts([]);
          setEnd(true);
          setLoadError(error.message);
        } else {
          const rows = (data ?? []) as Post[];
          setPosts(rows);
          setEnd(rows.length < PAGE_SIZE);
        }
      } catch (e: any) {
        if (!ignore) {
          console.error(e);
          setLoadError(e?.message ?? "Failed to load");
          setPosts([]);
          setEnd(true);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  // Fetch my likes for the posts currently loaded (so your heart persists on reload)
  useEffect(() => {
    if (!user || posts.length === 0) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("news_likes")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", posts.map((p) => p.id));

      if (error) {
        console.error(error);
        return;
      }
      if (cancelled) return;

      setMyLikes(new Set((data ?? []).map((r: any) => r.post_id)));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, supabase, idsKey(posts)]);

  // realtime INSERT from other users
  useEffect(() => {
    const channel = supabase
      .channel("news_posts_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "news_posts" },
        (payload: { new: Post }) => {
          setPosts((prev) => (prev.some((p) => p.id === payload.new.id) ? prev : [payload.new, ...prev]));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [supabase]);

  const loadMore = async () => {
    if (loadingMore || end || posts.length === 0) return;
    setLoadingMore(true);
    const from = posts.length;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("news_posts")
      .select(
        "id, author_id, author_name, author_avatar_url, content, photo_url, likes_count, comments_count, created_at"
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error(error);
      setEnd(true);
      setLoadingMore(false);
      return;
    }

    const rows = (data ?? []) as Post[];
    setPosts((prev) => {
      const next = [...prev, ...rows];
      return next;
    });
    if (rows.length < PAGE_SIZE) setEnd(true);
    setLoadingMore(false);

    // also fetch my likes for these new rows, then merge into myLikes set
    if (user && rows.length) {
      const { data: likes } = await supabase
        .from("news_likes")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", rows.map((r) => r.id));

      if (likes?.length) {
        setMyLikes((prev) => {
          const next = new Set(prev);
          likes.forEach((l: any) => next.add(l.post_id));
          return next;
        });
      }
    }
  };

  /* ---------- counts sync helper ---------- */
  const refreshCounts = async (postId: string, kind: "likes" | "comments") => {
    if (kind === "likes") {
      const { count } = await supabase
        .from("news_likes")
        .select("post_id", { head: true, count: "exact" })
        .eq("post_id", postId);

      await supabase.from("news_posts").update({ likes_count: count ?? 0 }).eq("id", postId);

      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, likes_count: count ?? 0 } : p))
      );
      return;
    }

    const { count } = await supabase
      .from("news_comments")
      .select("post_id", { head: true, count: "exact" })
      .eq("post_id", postId);

    await supabase.from("news_posts").update({ comments_count: count ?? 0 }).eq("id", postId);

    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments_count: count ?? 0 } : p))
    );
  };

  /* ---------- likes (one per user, toggle) ---------- */
  const toggleLike = async (postId: string) => {
    if (!user) return;

    const iLike = myLikes.has(postId);

    // optimistic UI
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, likes_count: (p.likes_count ?? 0) + (iLike ? -1 : 1) } : p
      )
    );
    setMyLikes((prev) => {
      const next = new Set(prev);
      if (iLike) next.delete(postId);
      else next.add(postId);
      return next;
    });

    // server write
    if (iLike) {
      const { error } = await supabase
        .from("news_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      if (error) console.error(error);
    } else {
      const { error } = await supabase
        .from("news_likes")
        .insert([{ post_id: postId, user_id: user.id }]);
      if (error) {
        // rollback on failure
        console.error(error);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, likes_count: Math.max(0, (p.likes_count ?? 1) - 1) } : p
          )
        );
        setMyLikes((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        return;
      }
    }

    // ensure DB + UI are in sync with the true total
    await refreshCounts(postId, "likes");
  };

  /* ---------- delete (author only) ---------- */
  const canDelete = (p: Post) => user && p.author_id === user.id;

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("news_posts").delete().eq("id", id).select("id").maybeSingle();
    if (error) return console.error("Delete failed:", error);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  /* ---------- comments (dialog) ---------- */
  const openCommentsDialog = async (postId: string) => {
    setCommentsOpenFor(postId);
    setCommentText("");
    setLoadingComments(true);

    // 1) Load comments
    const { data } = await supabase
      .from("news_comments")
      .select("id, post_id, author_id, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    const base = (data ?? []) as Comment[];

    // 2) Load commenter profiles (names/avatars)
    let enhanced: Comment[] = base;
    if (base.length) {
      const authorIds = Array.from(new Set(base.map((c) => c.author_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", authorIds);

      const map = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      (profs ?? []).forEach((p: any) => {
        map.set(p.id, { full_name: p.full_name ?? null, avatar_url: p.avatar_url ?? null });
      });

      enhanced = base.map((c) => ({
        ...c,
        author_name: map.get(c.author_id)?.full_name ?? "Someone",
        author_avatar_url: map.get(c.author_id)?.avatar_url ?? null,
      }));
    }

    setComments(enhanced);
    setLoadingComments(false);
  };

  const closeCommentsDialog = () => {
    setCommentsOpenFor(null);
    setComments([]);
    setCommentText("");
  };

  const sendComment = async () => {
    if (!user || !commentsOpenFor) return;
    const text = commentText.trim();
    if (!text) return;

    const postId = commentsOpenFor;

    // optimistic local with current user's name/avatar
    const local: Comment = {
      id: `local-${Date.now()}`,
      post_id: postId,
      author_id: user.id,
      body: text,
      created_at: new Date().toISOString(),
      author_name: profile.full_name ?? "You",
      author_avatar_url: profile.avatar_url ?? null,
    };
    setComments((prev) => [...prev, local]);
    setCommentText("");
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments_count: (p.comments_count ?? 0) + 1 } : p
      )
    );

    // server
    const { data, error } = await supabase
      .from("news_comments")
      .insert([{ post_id: postId, author_id: user.id, body: text }])
      .select("id, post_id, author_id, body, created_at")
      .single();

    if (error) {
      console.error(error);
      setComments((prev) => prev.filter((c) => c.id !== local.id));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 1) - 1) } : p
        )
      );
      return;
    }

    // replace local with real record but keep author display info
    setComments((prev) =>
      prev.map((c) =>
        c.id === local.id
          ? {
              ...(data as Comment),
              author_name: profile.full_name ?? "You",
              author_avatar_url: profile.avatar_url ?? null,
            }
          : c
      )
    );

    // write the true total back and sync UI
    await refreshCounts(postId, "comments");
  };

  /* ---------- render ---------- */
  return (
    <main className="relative">
      <div className="border-b border-black/5 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-5">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Newsfeed</h1>
          <p className="text-sm text-gray-600">
            Share updates, see what others are posting, and celebrate happy adoptions.
          </p>
        </div>
      </div>

      {/* Composer */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-3">
        <div className="rounded-xl border border-black/10 bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-black/10 bg-gray-100 grid place-items-center text-[10px] font-bold">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-9 w-9 object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div className="flex-1">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={user ? "Share something with everyone…" : "Sign in to post…"}
                rows={2}
                className="w-full resize-none rounded-lg border border-black/10 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-400 disabled:opacity-60"
                disabled={!user}
              />

              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={chooseFile}
                    disabled={!user || uploading}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm ring-1 ring-black/10 hover:bg-black/5 disabled:opacity-60"
                    title="Upload image"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    Upload
                  </button>

                  <ImageIcon className="h-4 w-4 text-gray-500" />
                  <input
                    type="url"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="Image URL (optional)"
                    className="w-full sm:w-72 rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-fuchsia-400"
                    disabled={!user || uploading}
                  />

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  />
                </div>

                <button
                  onClick={handlePost}
                  disabled={postDisabled || uploading}
                  className="inline-flex items-center gap-2 self-end sm:self-auto rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Post
                </button>
              </div>

              {photoUrl && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="preview"
                    className="h-16 w-16 rounded-md object-cover ring-1 ring-black/10"
                    onError={() => {}}
                  />
                  <button
                    onClick={() => setPhotoUrl("")}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ring-1 ring-black/10 hover:bg-black/5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {!user && (
            <div className="mt-2 text-[12px] text-gray-600">
              <Link href="/sign-in" className="underline">
                Sign in
              </Link>{" "}
              to create a post.
            </div>
          )}
        </div>
      </section>

      {/* Feed */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-4">
        <div className="h-[calc(100vh-250px)] overflow-y-auto rounded-xl">
          {loading ? (
            <SkeletonList />
          ) : loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Failed to load feed: {loadError}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <ul className="space-y-3">
                {posts.map((p) => {
                  const iLike = myLikes.has(p.id);
                  return (
                    <li
                      key={p.id}
                      className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm"
                    >
                      <div className="flex gap-3">
                        {/* CLICKABLE AVATAR -> profile */}
                        <Link
                          href={`/users/${p.author_id}`}
                          className="h-10 w-10 overflow-hidden rounded-full ring-1 ring-black/10 bg-gray-100 grid place-items-center text-xs font-bold flex-shrink-0"
                          title={p.author_name ?? "View profile"}
                        >
                          {p.author_avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.author_avatar_url} alt="" className="h-10 w-10 object-cover" />
                          ) : (
                            <User2 className="h-5 w-5 text-gray-500" />
                          )}
                        </Link>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {/* CLICKABLE NAME -> profile */}
                              <Link
                                href={`/users/${p.author_id}`}
                                className="truncate font-semibold hover:underline"
                                title="View profile"
                              >
                                {p.author_name ?? "Someone"}
                              </Link>
                              <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
                                <Clock className="h-3.5 w-3.5" />
                                <span>{timeAgo(p.created_at)}</span>
                              </div>
                            </div>

                            {canDelete(p) && (
                              <button
                                onClick={() => handleDelete(p.id)}
                                title="Delete post"
                                className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          {p.content && (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{p.content}</p>
                          )}

                          {p.photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.photo_url}
                              alt=""
                              className="mt-3 max-h-[420px] w-full rounded-xl object-cover"
                            />
                          )}

                          {/* actions */}
                          <div className="mt-3 flex items-center gap-3">
                            <button
                              onClick={() => toggleLike(p.id)}
                              disabled={!user}
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm ring-1 ring-black/10 hover:bg-black/5 ${
                                iLike ? "text-pink-600" : ""
                              }`}
                              title={user ? "Like" : "Sign in to like"}
                            >
                              <Heart className="h-4 w-4" />
                              <span>{p.likes_count ?? 0}</span>
                            </button>

                            <button
                              onClick={() => openCommentsDialog(p.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm ring-1 ring-black/10 hover:bg-black/5"
                            >
                              <MessageSquare className="h-4 w-4" />
                              <span>{p.comments_count ?? 0}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {!end && (
                <div className="mt-6 flex items-center justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-800 ring-1 ring-black/10 hover:bg-black/5 disabled:opacity-60"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ---------- Comments Dialog ---------- */}
      {commentsOpenFor && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCommentsDialog}
            aria-hidden
          />
          <div className="absolute left-1/2 top-1/2 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Comments</h3>
              <button
                onClick={closeCommentsDialog}
                className="rounded-md p-1 hover:bg-black/5"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {loadingComments ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : comments.length === 0 ? (
                <div className="text-sm text-gray-500">No comments yet.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-md bg-black/5 px-2 py-1 text-sm">
                    {/* commenter name + time */}
                    <div className="mb-0.5 flex items-center gap-2 text-xs text-gray-700">
                      <Link href={`/users/${c.author_id}`} className="font-semibold hover:underline">
                        {c.author_name ?? "Someone"}
                      </Link>
                      <span className="text-gray-500">{timeAgo(c.created_at)}</span>
                    </div>
                    <div className="text-gray-800">{c.body}</div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment…"
                className="flex-1 rounded-md border border-black/10 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-fuchsia-400"
                disabled={!user}
              />
              <button
                onClick={sendComment}
                disabled={!user || !commentText.trim()}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------- UI helpers ---------- */
function SkeletonList() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="animate-pulse rounded-2xl border border-black/10 bg-white p-4"
        >
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-full bg-black/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-black/10" />
              <div className="h-3 w-1/4 rounded bg-black/10" />
              <div className="h-20 w-full rounded bg-black/10" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center">
      <div className="text-4xl">📰</div>
      <h3 className="mt-2 text-lg font-semibold">No posts yet</h3>
      <p className="mt-1 text-sm text-gray-600">
        Be the first to share an update with the community!
      </p>
    </div>
  );
}

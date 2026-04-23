"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const NEXT_FALLBACK = "/dashboard";

function sanitizeNext(next: string | null): string {
  if (!next) return NEXT_FALLBACK;
  // オープンリダイレクト防止: 同一オリジンの絶対パスのみ許可
  if (!next.startsWith("/") || next.startsWith("//")) return NEXT_FALLBACK;
  if (next === "/login") return NEXT_FALLBACK;
  return next;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMsg("メールアドレスまたはパスワードが正しくありません。");
      return;
    }

    startTransition(() => {
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">メールアドレス</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">パスワード</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
        />
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
        >
          {errorMsg}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "ログイン中..." : "ログイン"}
      </Button>
    </form>
  );
}

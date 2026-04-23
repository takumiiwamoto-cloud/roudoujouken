"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 会社名フリーテキスト検索(URL クエリ ?q= を書き換えるだけ)。
 * フォーム送信で同じページに戻り、Server Component 側で再フェッチされる。
 */
export function DashboardSearch({ initialQ }: { initialQ: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [isPending, startTransition] = useTransition();

  function submitWith(nextQ: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (nextQ.trim()) {
      sp.set("q", nextQ.trim());
    } else {
      sp.delete("q");
    }
    const url = sp.toString() ? `/dashboard?${sp.toString()}` : "/dashboard";
    startTransition(() => {
      router.push(url);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitWith(q);
      }}
      className="flex gap-2"
    >
      <Input
        type="search"
        placeholder="会社名で絞り込み"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-64"
        disabled={isPending}
      />
      <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
        検索
      </Button>
      {initialQ && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setQ("");
            submitWith("");
          }}
        >
          クリア
        </Button>
      )}
    </form>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * サイドバー内のログアウトボタン。
 * signOut 後に /login へ replace し、サーバーコンポーネント側のキャッシュを
 * 無効化するため router.refresh() も呼ぶ。
 */
export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      disabled={isPending}
      className="w-full"
    >
      {isPending ? "ログアウト中..." : "ログアウト"}
    </Button>
  );
}

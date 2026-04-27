"use client";

/**
 * 顧客側ルートグループのエラー境界。
 *
 * Next.js App Router の規約: `error.tsx` は client component で、
 * `reset()` を受け取って同セグメントを再レンダリングできる。
 *
 * 顧客向けには技術的な詳細を見せず、事務所への連絡を促す文言にする。
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[public/error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-xl font-semibold">エラーが発生しました</h1>
      <p className="text-sm text-muted-foreground">
        画面の表示中に予期しないエラーが発生しました。
        <br />
        恐れ入りますが、しばらく経ってから再度お試しいただくか、
        ご依頼元の事務所までお問い合わせください。
      </p>
      <Button onClick={reset} variant="default">
        再読み込み
      </Button>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          エラーID: {error.digest}
        </p>
      ) : null}
    </div>
  );
}

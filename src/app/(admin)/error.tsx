"use client";

/**
 * 事務所側ルートグループのエラー境界。
 *
 * 事務所スタッフ向けにはエラーメッセージとエラーIDを表示し、再試行/ダッシュボード
 * へ戻るの両方を提供する。本格的なエラー追跡は今後 Sentry 等で実装予定。
 */

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-xl font-semibold">エラーが発生しました</h1>
      <p className="text-sm text-muted-foreground">
        想定外のエラーが発生しました。再試行してもエラーが続く場合は、ブラウザを
        再読み込みしてからもう一度お試しください。
      </p>
      {error.message ? (
        <pre className="max-w-full overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-left text-xs">
          {error.message}
        </pre>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} variant="default">
          再試行
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">ダッシュボードへ戻る</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          エラーID: {error.digest}
        </p>
      ) : null}
    </div>
  );
}

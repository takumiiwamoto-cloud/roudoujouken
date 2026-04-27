/**
 * 事務所側ルートグループの 404 ページ。
 *
 * 依頼ID 不正・存在しないルート等で表示される。
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-xl font-semibold">ページが見つかりません</h1>
      <p className="text-sm text-muted-foreground">
        指定された URL のページは存在しないか、依頼が削除された可能性があります。
      </p>
      <Button asChild variant="default">
        <Link href="/dashboard">ダッシュボードへ戻る</Link>
      </Button>
    </div>
  );
}

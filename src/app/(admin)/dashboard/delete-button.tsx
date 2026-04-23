"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { deleteRequestAction } from "./actions";

/**
 * 依頼削除ボタン(pending 行のみ一覧から呼び出す想定)。
 *   - window.confirm で誤操作防止
 *   - 成功時は revalidatePath による再描画で自動的に行が消える
 */
export function DeleteButton({
  id,
  companyName,
}: {
  id: string;
  companyName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const ok = window.confirm(
      `「${companyName}」の依頼を削除します。\nURLは無効化され、元に戻せません。よろしいですか?`,
    );
    if (!ok) return;

    startTransition(async () => {
      const r = await deleteRequestAction({ id });
      if (!r.ok) {
        window.alert(r.error);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "削除中" : "削除"}
    </Button>
  );
}

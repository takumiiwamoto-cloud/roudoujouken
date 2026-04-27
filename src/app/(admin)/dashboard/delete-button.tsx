"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ContractRequestStatus } from "@/lib/supabase/types";

import { deleteRequestAction } from "./actions";

/**
 * 依頼削除ボタン(delivered 以外の行から呼び出す想定)。
 *   - status に応じた警告文で誤操作防止(入力済/確認中は顧客データ喪失を強調)
 *   - 成功時は revalidatePath による再描画で自動的に行が消える
 */
export function DeleteButton({
  id,
  companyName,
  status,
}: {
  id: string;
  companyName: string;
  status: ContractRequestStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const message =
      status === "pending"
        ? `「${companyName}」の依頼を削除します。\nURLは無効化され、元に戻せません。よろしいですか?`
        : `「${companyName}」の依頼を削除します。\n顧客が入力した内容・事務所側の追記がすべて失われ、元に戻せません。\n本当に削除しますか?`;
    const ok = window.confirm(message);
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

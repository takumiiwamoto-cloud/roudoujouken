"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const description =
    status === "pending"
      ? `「${companyName}」の依頼を削除します。URLは無効化され、元に戻せません。`
      : `「${companyName}」の依頼を削除します。顧客が入力した内容・事務所側の追記がすべて失われ、元に戻せません。`;

  function handleConfirm(e: React.MouseEvent) {
    // Radix のデフォルトはアクション後に閉じるが、エラー時はダイアログを残したいので
    // 自前で制御する。
    e.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const r = await deleteRequestAction({ id });
      if (!r.ok) {
        setErrorMessage(r.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return; // 処理中は閉じさせない
        setOpen(next);
        if (!next) setErrorMessage(null);
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        {isPending ? "削除中" : "削除"}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>依頼を削除しますか?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(
              buttonVariants({ variant: "destructive" }),
            )}
          >
            {isPending ? "削除中..." : "削除する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

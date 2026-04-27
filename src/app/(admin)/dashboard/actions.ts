"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 依頼削除(delivered 以外を許可)
 *
 * 方針:
 *   - pending / submitted / reviewed は物理削除可(誤発行・入力やり直し対応)
 *   - delivered(納品済)は記録保持のため削除不可
 *   - DELETE 時に WHERE status IN (...) を付け、競合時は変化なしで返す
 */

const DELETABLE_STATUSES = ["pending", "submitted", "reviewed"] as const;

const deleteSchema = z.object({
  id: z.string().uuid("不正なIDです"),
});

export type DeleteRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteRequestAction(
  input: unknown,
): Promise<DeleteRequestResult> {
  await requireUser();

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "不正なリクエストです" };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contract_requests")
    .delete()
    .eq("id", parsed.data.id)
    .in("status", DELETABLE_STATUSES as unknown as string[])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[dashboard/actions] delete failed", error);
    return { ok: false, error: "削除に失敗しました。時間を置いて再度お試しください。" };
  }
  if (!data) {
    return {
      ok: false,
      error: "納品済の依頼は削除できません。",
    };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 依頼削除(pending のみ許可)
 *
 * 方針:
 *   - status='pending' の行だけ物理削除(URL発行後、顧客入力が始まる前)
 *   - submitted 以降は顧客の入力データが入っているので誤削除防止のため不可
 *   - DELETE 時に WHERE status='pending' を付け、競合時は変化なしで返す
 */

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
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[dashboard/actions] delete failed", error);
    return { ok: false, error: "削除に失敗しました。時間を置いて再度お試しください。" };
  }
  if (!data) {
    return {
      ok: false,
      error: "この依頼は既に顧客入力が進んでいるため削除できません。",
    };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

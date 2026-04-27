"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { officeInputSchema } from "@/lib/validations/office-input";
import { clientFormSchema } from "@/lib/validations/client-form";
import { withAllowanceDescriptions } from "@/lib/allowances";
import type { ContractRequestStatus } from "@/lib/supabase/types";

/**
 * 詳細画面の Server Actions。
 *
 *   saveClientInputAction : client_input を jsonb で上書き保存(事務所編集モード)
 *   saveOfficeInputAction : office_input を jsonb で上書き保存
 *   changeStatusAction    : status を reviewed / delivered に遷移
 *
 * いずれも requireUser で多層防御。書き込みは admin client(RLS バイパス)。
 */

const idSchema = z.string().uuid("不正なIDです");

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveClientInputAction(input: {
  id: string;
  values: unknown;
}): Promise<SaveResult> {
  await requireUser();

  const idParsed = idSchema.safeParse(input.id);
  if (!idParsed.success) {
    return { ok: false, error: "不正なリクエストです" };
  }

  const parsed = clientFormSchema.safeParse(input.values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "入力内容に誤りがあります",
      fieldErrors,
    };
  }

  const values = parsed.data;
  const normalizedValues = {
    ...values,
    allowances:
      values.has_allowances === "yes"
        ? withAllowanceDescriptions(values.allowances ?? [])
        : [],
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("contract_requests")
    .update({ client_input: normalizedValues })
    .eq("id", idParsed.data);

  if (error) {
    console.error("[detail/actions] client input save failed", error);
    return { ok: false, error: "保存に失敗しました。時間を置いて再度お試しください。" };
  }

  revalidatePath(`/detail/${idParsed.data}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveOfficeInputAction(input: {
  id: string;
  values: unknown;
}): Promise<SaveResult> {
  await requireUser();

  const idParsed = idSchema.safeParse(input.id);
  if (!idParsed.success) {
    return { ok: false, error: "不正なリクエストです" };
  }

  const parsed = officeInputSchema.safeParse(input.values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "入力内容に誤りがあります",
      fieldErrors,
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("contract_requests")
    .update({ office_input: parsed.data })
    .eq("id", idParsed.data);

  if (error) {
    console.error("[detail/actions] save failed", error);
    return { ok: false, error: "保存に失敗しました。時間を置いて再度お試しください。" };
  }

  revalidatePath(`/detail/${idParsed.data}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

const changeStatusSchema = z.object({
  id: idSchema,
  status: z.enum(["reviewed", "delivered"]),
});

export async function changeStatusAction(input: {
  id: string;
  status: ContractRequestStatus;
}): Promise<SaveResult> {
  await requireUser();

  const parsed = changeStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "不正なリクエストです" };
  }

  const supabase = createAdminClient();
  const updates: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "delivered") {
    updates.delivered_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("contract_requests")
    .update(updates)
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[detail/actions] status change failed", error);
    return { ok: false, error: "ステータス変更に失敗しました。" };
  }

  revalidatePath(`/detail/${parsed.data.id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

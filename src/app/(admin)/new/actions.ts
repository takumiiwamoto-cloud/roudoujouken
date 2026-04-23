"use server";

import { randomBytes } from "crypto";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 新規 URL 発行(Server Action)
 *
 * プロンプト4-B:
 *   - フォーム入力 → access_token を暗号学的に安全な乱数で生成
 *   - contract_requests に INSERT
 *   - 発行 URL は NEXT_PUBLIC_BASE_URL + /form/<token>
 *
 * 認証: requireUser() でサーバー側多層防御(middleware で弾いた後の保険)。
 * DB 書き込みは service_role(admin client)を使う。
 *   → RLS をバイパスするが、この Server Action に到達する経路は
 *     middleware+requireUser で既に守られているため問題なし。
 */

const actionSchema = z.object({
  company_name: z.string().trim().min(1, "会社名は必須です"),
  representative_name: z.string().trim().min(1, "代表者氏名は必須です"),
  company_address: z.string().trim().min(1, "会社所在地は必須です"),
  template_name: z.string().trim().min(1, "ひな形を選択してください"),
  // HTML <input type="date"> の値は "YYYY-MM-DD"
  expires_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "有効期限の形式が不正です"),
});

export type CreateRequestResult =
  | {
      ok: true;
      id: string;
      token: string;
      url: string;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };

function generateAccessToken(): string {
  // 32 バイト(= 256bit)を URL-safe base64(43 文字) に。
  // 暗号学的乱数源として Node.js の crypto.randomBytes を使用。
  return randomBytes(32).toString("base64url");
}

/**
 * 有効期限の日付を、その日の 23:59:59(JST)を UTC に変換した timestamptz に。
 * ユーザーが「2026-05-07まで」と選んだら、2026-05-07 23:59:59 JST まで使える。
 */
function toExpiresAt(dateYmd: string): string {
  // JST(+09:00)固定でその日の終業終了時点まで有効化
  const [y, m, d] = dateYmd.split("-").map((v) => Number.parseInt(v, 10));
  // Date.UTC で UTC ミリ秒を作り、そこから JST 終端(14:59:59 UTC = 23:59:59 JST)に
  const utcMs = Date.UTC(y, m - 1, d, 23 - 9, 59, 59);
  return new Date(utcMs).toISOString();
}

function buildPublicUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const path = `/form/${token}`;
  return base ? `${base}${path}` : path;
}

export async function createRequestAction(
  input: unknown,
): Promise<CreateRequestResult> {
  await requireUser();

  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "入力内容に誤りがあります", fieldErrors };
  }

  const values = parsed.data;

  // 有効期限が過去/当日未満は拒否(今日の終わりまでは許容)
  const expiresAt = toExpiresAt(values.expires_on);
  if (new Date(expiresAt).getTime() <= Date.now()) {
    return {
      ok: false,
      error: "有効期限は明日以降の日付を指定してください",
      fieldErrors: { expires_on: "明日以降を指定してください" },
    };
  }

  const supabase = createAdminClient();
  const token = generateAccessToken();

  const { data, error } = await supabase
    .from("contract_requests")
    .insert({
      access_token: token,
      status: "pending",
      expires_at: expiresAt,
      company_name: values.company_name,
      company_address: values.company_address,
      representative_name: values.representative_name,
      template_name: values.template_name,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[new/actions] insert failed", error);
    return { ok: false, error: "URL発行に失敗しました。時間を置いて再度お試しください。" };
  }

  return {
    ok: true,
    id: data.id,
    token,
    url: buildPublicUrl(token),
  };
}

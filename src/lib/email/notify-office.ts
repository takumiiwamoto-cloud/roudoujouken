import "server-only";
import { Resend } from "resend";

import { renderOfficeSubmissionEmail } from "./templates/office-submission";

/**
 * 事務所宛て通知メール(顧客入力完了時)。
 *
 * Sheet7 ワークフロー Step 5 に対応する唯一の自動送信メール。
 * テンプレートは src/lib/email/templates/office-submission.ts に分離。
 *
 * 環境変数:
 *   RESEND_API_KEY           : Resend APIキー
 *   RESEND_FROM_EMAIL        : 送信元(Resend 認証済みドメインのアドレス)
 *   OFFICE_NOTIFICATION_EMAIL: 事務所宛ての通知先メールアドレス
 *   NEXT_PUBLIC_BASE_URL     : 管理画面URLのベース(例: https://xxxx.vercel.app)
 *
 * 必要な環境変数が未設定の場合はサーバーログに警告を残し、フォーム送信自体は
 * 成功扱いにする(開発環境で Resend 未整備でも本体機能は通すため)。
 */

export type NotifyOfficeParams = {
  requestId: string;
  companyName: string;
  employeeFullName: string;
  employmentType: string | undefined;
  templateName: string;
};

export type NotifyResult =
  | { sent: true }
  | { sent: false; reason: "env_missing" | "resend_error" | "exception" };

export async function notifyOfficeOfSubmission(
  params: NotifyOfficeParams,
): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.OFFICE_NOTIFICATION_EMAIL;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";

  if (!apiKey || !from || !to) {
    console.warn(
      "[notifyOfficeOfSubmission] 通知メールをスキップしました(環境変数未設定)",
      {
        hasApiKey: Boolean(apiKey),
        hasFrom: Boolean(from),
        hasTo: Boolean(to),
      },
    );
    return { sent: false, reason: "env_missing" };
  }

  const detailUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/detail/${params.requestId}`
    : `/detail/${params.requestId}`;

  const { subject, text, html } = renderOfficeSubmissionEmail({
    ...params,
    detailUrl,
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
    });
    if (error) {
      console.error("[notifyOfficeOfSubmission] Resend error", error);
      return { sent: false, reason: "resend_error" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[notifyOfficeOfSubmission] exception", e);
    return { sent: false, reason: "exception" };
  }
}

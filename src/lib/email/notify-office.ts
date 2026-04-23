import "server-only";
import { Resend } from "resend";

/**
 * 事務所宛て通知メール(顧客入力完了時)
 *
 * プロンプト3-C:
 *   - 件名: 【契約書依頼】◯◯会社から入力が完了しました
 *   - 本文: 会社名 / 従業員氏名 / 雇用形態 / 管理画面リンク
 *
 * 環境変数:
 *   RESEND_API_KEY           : Resend APIキー
 *   RESEND_FROM_EMAIL        : 送信元(Resend 認証済みドメインのアドレス)
 *   OFFICE_NOTIFICATION_EMAIL: 事務所宛ての通知先メールアドレス
 *   NEXT_PUBLIC_BASE_URL     : 管理画面URLのベース(例: https://xxxx.vercel.app)
 *
 * いずれも未設定の場合はログのみ吐いて成功扱いにする(開発環境で Resend 未整備でも
 * 送信処理が通るようにするため)。本番では環境変数未設定を検知し warn を残す。
 */

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  seishain: "正社員",
  keiyaku: "契約社員",
  part: "パート・アルバイト",
};

export type NotifyOfficeParams = {
  requestId: string;
  companyName: string;
  employeeFullName: string;
  employmentType: string | undefined;
  templateName: string;
};

export async function notifyOfficeOfSubmission(
  params: NotifyOfficeParams,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.OFFICE_NOTIFICATION_EMAIL;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";

  if (!apiKey || !from || !to) {
    // 未設定でもフォーム送信自体は成功させる。管理画面から再送できるようにする
    // 仕組みは Day 13(プロンプト6)で追加予定。
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

  const employmentLabel =
    EMPLOYMENT_TYPE_LABELS[params.employmentType ?? ""] ??
    params.employmentType ??
    "(未選択)";
  const detailUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/detail/${params.requestId}`
    : `/detail/${params.requestId}`;

  const subject = `【契約書依頼】${params.companyName} から入力が完了しました`;
  const text = [
    `${params.companyName} 様の雇用契約書依頼について、従業員側の入力が完了しました。`,
    "",
    `  会社名    : ${params.companyName}`,
    `  従業員氏名: ${params.employeeFullName}`,
    `  雇用形態  : ${employmentLabel}`,
    `  ひな形    : ${params.templateName}`,
    "",
    "以下の管理画面から内容をご確認ください:",
    detailUrl,
    "",
    "-- このメールは雇用契約書自動作成ツールから自動送信されています --",
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
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

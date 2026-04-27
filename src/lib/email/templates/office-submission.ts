/**
 * 顧客入力完了 → 事務所宛て通知メールのテンプレート。
 *
 * Sheet7 ワークフローのうち Step 5 に対応(本ツールがシステムから送る唯一の自動メール)。
 */

import {
  escapeHtml,
  htmlLayout,
  type RenderedEmail,
} from "./common";

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  seishain: "正社員",
  keiyaku: "契約社員",
  part: "パート・アルバイト",
};

export type OfficeSubmissionParams = {
  requestId: string;
  companyName: string;
  employeeFullName: string;
  employmentType: string | undefined;
  templateName: string;
  /** 管理画面の絶対URL(http(s) 込み)。 */
  detailUrl: string;
};

export function renderOfficeSubmissionEmail(
  p: OfficeSubmissionParams,
): RenderedEmail {
  const employmentLabel =
    EMPLOYMENT_TYPE_LABELS[p.employmentType ?? ""] ??
    p.employmentType ??
    "(未選択)";

  const subject = `【契約書依頼】${p.companyName} から入力が完了しました`;

  const text = [
    `${p.companyName} 様の雇用契約書依頼について、従業員側の入力が完了しました。`,
    "",
    `  会社名    : ${p.companyName}`,
    `  従業員氏名: ${p.employeeFullName}`,
    `  雇用形態  : ${employmentLabel}`,
    `  ひな形    : ${p.templateName}`,
    "",
    "以下の管理画面から内容をご確認ください:",
    p.detailUrl,
    "",
    "-- このメールは雇用契約書自動作成ツールから自動送信されています --",
  ].join("\n");

  const rows = [
    ["会社名", p.companyName],
    ["従業員氏名", p.employeeFullName],
    ["雇用形態", employmentLabel],
    ["ひな形", p.templateName],
  ]
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:6px 12px 6px 0;color:#6b7280;font-weight:normal;white-space:nowrap;">${escapeHtml(k)}</th><td style="padding:6px 0;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const body = `
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(p.companyName)}</strong> 様の雇用契約書依頼について、従業員側の入力が完了しました。
    </p>
    <table style="border-collapse:collapse;margin:8px 0 16px;">${rows}</table>
    <p style="margin:0 0 8px;">以下の管理画面から内容をご確認ください:</p>
    <p style="margin:0;">
      <a href="${escapeHtml(p.detailUrl)}" style="display:inline-block;padding:8px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">管理画面を開く</a>
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">${escapeHtml(p.detailUrl)}</p>
  `.trim();

  const html = htmlLayout({
    heading: subject,
    body,
  });

  return { subject, text, html };
}

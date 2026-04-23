import { z } from "zod";

/**
 * 事務所側入力(Sheet03 の No.5〜26 のうちユーザー入力項目)の zod スキーマ。
 *
 * Sheet03 の No.1〜4(ステータス/会社情報/ひな形/期限)は contract_requests の
 * 列として既に確定している(プロンプト4-B の URL 発行時)ため、office_input には
 * 含めない。No.19/24/25/28/29 は自動計算表示・自動記録なので保存対象外。
 *
 * 全項目は任意(未入力でも保存可)だが、docx 生成時には Sheet05 No.16/17 の
 * ブロッキングルール(必須項目・2024改正項目の充足)を validateOfficeInput で検査する。
 */

export const worktimeTypeValues = [
  "normal",
  "monthly_variable",
  "yearly_variable",
  "flextime",
  "outside",
  "discretionary",
] as const;
export type WorktimeType = (typeof worktimeTypeValues)[number];

export const agreement36Values = ["filed", "not_filed", "not_required"] as const;
export const booleanLikeValues = ["yes", "no"] as const;
export const fixedOvertimePresenceValues = ["none", "present"] as const;
export const probationDifferenceValues = ["same", "different"] as const;
export const probationSocialInsuranceValues = ["enrolled", "not_enrolled"] as const;

export const officeInputSchema = z.object({
  // Section 2. 労働時間制の専門判断
  worktime_type: z.enum(worktimeTypeValues).optional(),
  yearly_variable_target_period: z.string().optional(),
  yearly_variable_special_period: z.string().optional(),
  flextime_settlement_period: z.string().optional(),
  flextime_core_time: z.string().optional(),
  agreement_36_status: z.enum(agreement36Values).optional(),

  // Section 3. 管理監督者・特殊区分
  manager_supervisor: z.enum(booleanLikeValues).optional(),
  manager_supervisor_memo: z.string().optional(),
  high_professional: z.enum(booleanLikeValues).optional(),

  // Section 4. 固定残業代の設計
  fixed_overtime: z.enum(fixedOvertimePresenceValues).optional(),
  fixed_overtime_name: z.string().optional(),
  fixed_overtime_hours: z
    .union([z.coerce.number().nonnegative(), z.literal("")])
    .optional(),
  fixed_overtime_amount: z
    .union([z.coerce.number().int().nonnegative(), z.literal("")])
    .optional(),
  fixed_overtime_excess_notice: z.boolean().optional(),

  // Section 5. 試用期間の詳細(顧客側で has_probation='yes' のときのみ)
  probation_difference: z.enum(probationDifferenceValues).optional(),
  probation_wage: z
    .union([z.coerce.number().int().nonnegative(), z.literal("")])
    .optional(),
  probation_social_insurance: z
    .enum(probationSocialInsuranceValues)
    .optional(),
  probation_work_conditions: z.string().optional(),

  // Section 6. 最終チェック・納品
  // 納品メモ(Sheet03 No.26 事務所内部メモ兼用)
  internal_memo: z.string().optional(),
});

export type OfficeInputValues = z.infer<typeof officeInputSchema>;

/** 空の既定値 */
export function emptyOfficeInput(): OfficeInputValues {
  return {
    worktime_type: undefined,
    yearly_variable_target_period: "",
    yearly_variable_special_period: "",
    flextime_settlement_period: "",
    flextime_core_time: "",
    agreement_36_status: undefined,
    manager_supervisor: undefined,
    manager_supervisor_memo: "",
    high_professional: undefined,
    fixed_overtime: undefined,
    fixed_overtime_name: "",
    fixed_overtime_hours: "",
    fixed_overtime_amount: "",
    fixed_overtime_excess_notice: false,
    probation_difference: undefined,
    probation_wage: "",
    probation_social_insurance: undefined,
    probation_work_conditions: "",
    internal_memo: "",
  };
}

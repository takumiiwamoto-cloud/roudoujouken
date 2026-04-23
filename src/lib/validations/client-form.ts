import { z } from "zod";

/**
 * 顧客入力フォーム(C-01 / 設計書 Sheet02 の45項目)の zod スキーマ。
 *
 * 現段階(プロンプト3-A)は **必須チェックのみの仮実装** とする。
 * Sheet05 のルール(日付整合性・最低賃金・休憩時間・有期の更新上限等)は
 * プロンプト3-B(Day 5-7 後半)でここに差し替え予定。
 *
 * Sheet04 の雇用形態別マトリクスによる条件付き必須化は、zod の cross-field
 * バリデーションでの実装を 3-B で行う。現段階では UI 側の表示制御のみで済ませ、
 * 条件付き項目は optional にしている。
 */

export const employmentTypeValues = ["seishain", "keiyaku", "part"] as const;
export type EmploymentType = (typeof employmentTypeValues)[number];

export const genderValues = ["male", "female", "no_answer"] as const;
export const contractPeriodValues = ["yes", "no"] as const;
export const renewalTypeValues = ["auto", "maybe", "no"] as const;
export const probationValues = ["yes", "no"] as const;
export const workTimeTypeValues = ["fixed", "shift"] as const;
export const wageTypeValues = [
  "monthly",
  "daily_monthly",
  "hourly",
  "daily",
] as const;
export const paymentMethodValues = ["bank_transfer", "cash"] as const;
export const paymentCutoffValues = ["end", "15", "20", "other"] as const;
export const remoteWorkValues = ["yes", "no"] as const;
export const hasAllowancesValues = ["yes", "no"] as const;
export const holidayTypeValues = ["weekday", "shift", "other"] as const;
export const socialInsuranceValues = [
  "health",
  "pension",
  "employment",
  "rousai",
] as const;
export const weekdayValues = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export const clientFormSchema = z.object({
  // 1. 労働者基本情報(No.1-8)
  last_name: z.string().min(1, "姓を入力してください"),
  first_name: z.string().min(1, "名を入力してください"),
  last_name_kana: z.string().min(1, "姓(フリガナ)を入力してください"),
  first_name_kana: z.string().min(1, "名(フリガナ)を入力してください"),
  birth_date: z.string().min(1, "生年月日を入力してください"),
  gender: z.enum(genderValues).optional(),
  postal_code: z
    .string()
    .min(1, "郵便番号を入力してください")
    .regex(/^\d{7}$/, "7桁の半角数字で入力してください"),
  address: z.string().min(1, "住所を入力してください"),
  phone: z.string().min(1, "電話番号を入力してください"),
  email: z
    .string()
    .email("正しいメールアドレスを入力してください")
    .optional()
    .or(z.literal("")),

  // 2. 雇用区分・契約期間(No.9-17)
  employment_type: z.enum(employmentTypeValues, {
    message: "雇用形態を選択してください",
  }),
  has_contract_period: z.enum(contractPeriodValues),
  contract_start_date: z.string().min(1, "契約開始日を入力してください"),
  contract_end_date: z.string().optional(),
  renewal_type: z.enum(renewalTypeValues).optional(),
  renewal_limit_exists: z.enum(contractPeriodValues).optional(),
  renewal_limit_content: z.string().optional(),
  has_probation: z.enum(probationValues),
  probation_period: z.string().optional(),

  // 3. 就業場所(No.18-20・2024年改正)
  work_location_initial: z
    .string()
    .min(1, "雇入れ直後の就業場所を入力してください"),
  work_location_scope: z
    .string()
    .min(1, "就業場所の変更の範囲を入力してください(2024年改正で必須)"),
  remote_work: z.enum(remoteWorkValues).optional(),

  // 4. 業務内容(No.21-22・2024年改正)
  job_description_initial: z
    .string()
    .min(1, "雇入れ直後の業務内容を入力してください"),
  job_description_scope: z
    .string()
    .min(1, "業務の変更の範囲を入力してください(2024年改正で必須)"),

  // 5. 所定労働時間・休日(No.23-30)
  work_time_type: z.enum(workTimeTypeValues),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  break_minutes: z
    .union([z.coerce.number().int().nonnegative(), z.literal("")])
    .optional(),
  shift_note: z.string().optional(),
  holidays: z.array(z.enum(holidayTypeValues)).min(1, "休日を選択してください"),
  holiday_weekdays: z.array(z.enum(weekdayValues)).optional(),
  annual_leave: z.string().optional(),

  // 6. 賃金(No.31-41)
  wage_type: z.enum(wageTypeValues),
  basic_wage: z.coerce
    .number({ message: "数値で入力してください" })
    .positive("0より大きい金額を入力してください"),
  has_allowances: z.enum(hasAllowancesValues),
  allowances: z
    .array(
      z.object({
        name: z.string(),
        amount: z.union([z.coerce.number().int(), z.literal("")]).optional(),
      }),
    )
    .optional(),
  commute_allowance: z
    .union([z.coerce.number().int().nonnegative(), z.literal("")])
    .optional(),
  payment_cutoff_day: z.enum(paymentCutoffValues, {
    message: "賃金締切日を選択してください",
  }),
  payment_cutoff_other: z.string().optional(),
  payment_date: z.string().min(1, "賃金支払日を入力してください"),
  payment_method: z.enum(paymentMethodValues),
  salary_increase: z.string().optional(),
  bonus: z.string().optional(),
  retirement_allowance: z.string().optional(),

  // 7. その他(No.42-45)
  social_insurance: z
    .array(z.enum(socialInsuranceValues))
    .min(1, "社会保険を選択してください"),
  retirement_clause: z.string().optional(),
  retirement_age: z.string().optional(),
  remarks: z.string().optional(),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

/**
 * template_name から雇用形態・有期/無期のデフォルトを推定。
 * 事務所側(プロンプト4-B)で URL 発行時にひな形を選ばせる前提。
 */
export function deriveDefaultsFromTemplate(templateName: string): {
  employment_type?: EmploymentType;
  has_contract_period?: "yes" | "no";
} {
  if (templateName.includes("正社員")) {
    return { employment_type: "seishain", has_contract_period: "no" };
  }
  if (templateName.includes("契約社員")) {
    return { employment_type: "keiyaku", has_contract_period: "yes" };
  }
  if (templateName.includes("パート無期")) {
    return { employment_type: "part", has_contract_period: "no" };
  }
  if (templateName.includes("パート有期")) {
    return { employment_type: "part", has_contract_period: "yes" };
  }
  return {};
}

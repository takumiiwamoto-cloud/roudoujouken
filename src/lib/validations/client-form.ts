import { z } from "zod";

import { calcNetWorkMinutes } from "./minimum-wage";

/**
 * 顧客入力フォーム(C-01 / 設計書 Sheet02 の45項目)の zod スキーマ。
 *
 * Sheet05 の顧客側ルール(No.1-11)を反映:
 *   - No.1  必須項目               → 各フィールドの .min(1) / enum
 *   - No.2  契約開始日 < 契約終了日 → superRefine
 *   - No.3  契約開始日 ≧ 入力時点   → 警告(UI側で注意喚起のみ、送信可)
 *   - No.4  メール形式             → .email() (任意項目のため optional)
 *   - No.5  郵便番号 7桁           → .regex(/^\d{7}$/)
 *   - No.6  月給の最低賃金         → 非同期。customer-form.tsx 側で API 叩いて setError
 *   - No.7  時給の最低賃金         → 同上
 *   - No.8  労基法34条 休憩時間    → superRefine
 *   - No.9  有期の更新上限の有無・内容 → superRefine
 *   - No.10 就業場所の変更範囲(2024改正) → .min(1)
 *   - No.11 業務の変更範囲(2024改正)    → .min(1)
 *
 * No.6 / No.7(最低賃金)は都道府県マスタへのアクセスが必要なため、
 * 純粋 zod ではなく customer-form.tsx 側で /api/minimum-wage を叩き、
 * form.setError("basic_wage", ...) で反映する。送信ブロックは UI 側で
 * hasMinWageError フラグを持って disabled 制御する。
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

const baseClientFormSchema = z.object({
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

export const clientFormSchema = baseClientFormSchema.superRefine((v, ctx) => {
  // -------------------------------------------------------------------
  // No.2 契約開始日 < 契約終了日
  // -------------------------------------------------------------------
  if (v.has_contract_period === "yes") {
    if (!v.contract_end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contract_end_date"],
        message: "契約期間の定めがある場合、契約終了日を入力してください",
      });
    } else if (
      v.contract_start_date &&
      v.contract_end_date <= v.contract_start_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contract_end_date"],
        message: "契約終了日は契約開始日より後の日付にしてください",
      });
    }
  }

  // -------------------------------------------------------------------
  // No.8 労基法34条(休憩時間)
  //   実労働 6h 超(= 拘束時間 - 休憩 > 6h) → 休憩 45分以上
  //   実労働 8h 超 → 60分以上
  // 固定時間制のみ。シフト制は本人の日毎拘束時間が不明なのでスキップ。
  // -------------------------------------------------------------------
  if (v.work_time_type === "fixed") {
    const breakMin =
      typeof v.break_minutes === "number" ? v.break_minutes : null;
    const net = calcNetWorkMinutes(v.start_time, v.end_time, breakMin);
    if (net !== null) {
      if (net > 8 * 60 && (breakMin ?? 0) < 60) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["break_minutes"],
          message:
            "労働時間が8時間を超える場合、休憩は60分以上必要です(労基法34条)",
        });
      } else if (net > 6 * 60 && (breakMin ?? 0) < 45) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["break_minutes"],
          message:
            "労働時間が6時間を超える場合、休憩は45分以上必要です(労基法34条)",
        });
      }
    }
  }

  // -------------------------------------------------------------------
  // No.9 有期契約の更新上限(2024年改正)
  // -------------------------------------------------------------------
  if (v.has_contract_period === "yes") {
    if (!v.renewal_limit_exists) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["renewal_limit_exists"],
        message:
          "契約期間の定めがある場合、更新上限の有無を選択してください(2024年改正)",
      });
    } else if (
      v.renewal_limit_exists === "yes" &&
      !v.renewal_limit_content?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["renewal_limit_content"],
        message:
          "更新上限ありの場合、通算年数または更新回数を入力してください",
      });
    }
  }

  // -------------------------------------------------------------------
  // 条件付き必須の補助(Sheet04 の表示制御と整合)
  // -------------------------------------------------------------------
  if (v.work_time_type === "fixed") {
    if (!v.start_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start_time"],
        message: "始業時刻を入力してください",
      });
    }
    if (!v.end_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_time"],
        message: "終業時刻を入力してください",
      });
    }
    if (v.break_minutes === "" || v.break_minutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["break_minutes"],
        message: "休憩時間を入力してください",
      });
    }
  }

  if (
    v.holidays?.includes("weekday") &&
    (!v.holiday_weekdays || v.holiday_weekdays.length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["holiday_weekdays"],
      message: "休日指定曜日を選択してください",
    });
  }

  if (v.has_probation === "yes" && !v.probation_period?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["probation_period"],
      message: "試用期間の長さを入力してください(例: 3ヶ月)",
    });
  }

  if (
    v.payment_cutoff_day === "other" &&
    !v.payment_cutoff_other?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payment_cutoff_other"],
      message: "賃金締切日(その他)の内容を入力してください",
    });
  }
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

/**
 * No.3(警告レベル): 契約開始日が入力時点より過去かどうか。
 * true の場合 UI 側で黄色バナー表示のみ、送信はブロックしない。
 */
export function isContractStartInPast(
  contractStartDate: string | undefined,
): boolean {
  if (!contractStartDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(contractStartDate);
  if (Number.isNaN(start.getTime())) return false;
  return start < today;
}

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

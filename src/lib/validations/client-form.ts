import { z } from "zod";

import {
  ALLOWANCE_PATTERNS,
  allowanceTypeValues,
  type AllowanceType,
} from "@/lib/allowances";

import { calcNetWorkMinutes } from "./minimum-wage";

/**
 * 顧客入力フォーム(C-01)の zod スキーマ。
 *
 * 労働条件通知書(労基法15条・施行規則5条)の法定記載事項に必要な項目のみを扱う。
 * フリガナ・生年月日・性別・住所・電話・メール等は本ツール対象外
 * (別の労務手続ツールで管理する前提で意図的に省いている)。
 *
 * Sheet05 の顧客側ルールを反映:
 *   - 必須項目           → 各フィールドの .min(1) / enum
 *   - 契約開始日 < 契約終了日 → superRefine
 *   - 契約開始日 ≧ 入力時点 → 警告(UI側で注意喚起のみ、送信可)
 *   - 月給/時給の最低賃金 → customer-form.tsx 側で /api/minimum-wage を叩き setError
 *   - 労基法34条 休憩時間 → superRefine
 *   - 有期の更新上限の有無・内容 → superRefine
 *   - 就業場所/業務の変更範囲(2024改正) → .min(1)
 */

export const employmentTypeValues = ["seishain", "keiyaku", "part"] as const;
export type EmploymentType = (typeof employmentTypeValues)[number];

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
export const paymentCutoffValues = [
  "end",
  "10",
  "15",
  "20",
  "25",
  "other",
] as const;
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
  // 1. 労働者氏名(労働条件通知書の法定記載事項に必要な最小項目)
  last_name: z
    .string()
    .min(1, "姓を入力してください")
    .refine((v) => !/[\s\u3000]/.test(v), "姓と名は別々の欄に分けて入力してください"),
  first_name: z
    .string()
    .min(1, "名を入力してください")
    .refine((v) => !/[\s\u3000]/.test(v), "姓と名は別々の欄に分けて入力してください"),

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
        allowance_type: z.enum(allowanceTypeValues),
        allowance_name: z.string().default(""),
        allowance_pattern: z.string().default(""),
        allowance_amount: z.number().int().nonnegative().nullable().default(null),
        allowance_percentage: z.number().nonnegative().nullable().default(null),
        allowance_upper_limit: z
          .number()
          .int()
          .nonnegative()
          .nullable()
          .default(null),
        allowance_spouse_amount: z
          .number()
          .int()
          .nonnegative()
          .nullable()
          .default(null),
        allowance_child_amount: z
          .number()
          .int()
          .nonnegative()
          .nullable()
          .default(null),
        allowance_free_text: z.string().nullable().default(null),
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
  // 労災保険は常時 ON(UI で disabled)。健康保険・厚生年金・雇用保険の
  // 加入有無は事業主判断に委ねる(ブロックせず送信可)。
  social_insurance: z.array(z.enum(socialInsuranceValues)),
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

  // -------------------------------------------------------------------
  // 諸手当: has_allowances=yes の場合、各行の支給パターンと必須フィールド
  // -------------------------------------------------------------------
  if (v.has_allowances === "yes" && Array.isArray(v.allowances)) {
    v.allowances.forEach((a, i) => {
      const patterns = ALLOWANCE_PATTERNS[a.allowance_type as AllowanceType] ?? [];
      const def = patterns.find((p) => p.id === a.allowance_pattern);
      if (!def) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowances", i, "allowance_pattern"],
          message: "支給パターンを選択してください",
        });
        return;
      }
      if (!a.allowance_name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowances", i, "allowance_name"],
          message: "手当名を入力してください",
        });
      }
      for (const f of def.fields) {
        if (f === "amount" && !((a.allowance_amount ?? 0) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowances", i, "allowance_amount"],
            message: "金額を入力してください(0円不可)",
          });
        }
        if (f === "percentage" && !((a.allowance_percentage ?? 0) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowances", i, "allowance_percentage"],
            message: "割合(%)を入力してください",
          });
        }
        if (f === "upper_limit" && !((a.allowance_upper_limit ?? 0) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowances", i, "allowance_upper_limit"],
            message: "上限額を入力してください",
          });
        }
        if (f === "spouse_amount" && !((a.allowance_spouse_amount ?? 0) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowances", i, "allowance_spouse_amount"],
            message: "配偶者分の金額を入力してください",
          });
        }
        if (f === "child_amount" && !((a.allowance_child_amount ?? 0) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowances", i, "allowance_child_amount"],
            message: "子分の金額を入力してください",
          });
        }
        if (f === "free_text" && !a.allowance_free_text?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowances", i, "allowance_free_text"],
            message: "内容を記入してください",
          });
        }
      }
    });
  }

  // 労基法56条・57条(年少者)チェックは birth_date を扱わなくなったため、
  // 事務所側の目視確認に委ねる運用。
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
 * 定年のプリセット(高年齢者雇用安定法に準拠)。
 * 末尾の「その他(自由記述)」は UI 側の PresetOrOtherField で自動追加される。
 */
export const RETIREMENT_AGE_PRESETS = [
  "満60歳に達した誕生日の月の末日",
  "満65歳に達した誕生日の月の末日",
  "満60歳に達した誕生日の月の末日(本人希望により65歳まで再雇用)",
  "満60歳に達した誕生日の月の末日(希望者全員65歳まで継続雇用)",
  "満65歳に達した誕生日の月の末日(希望者全員70歳まで継続雇用)",
  "定めなし",
] as const;
export const DEFAULT_RETIREMENT_AGE: string =
  "満60歳に達した誕生日の月の末日(本人希望により65歳まで再雇用)";

/**
 * 退職に関する事項のプリセット(就業規則参照型を基本とする)。
 * 末尾の「その他(自由記述)」は UI 側の PresetOrOtherField で自動追加される。
 */
export const RETIREMENT_CLAUSE_PRESETS = [
  "解雇の事由及び手続、その他詳細は就業規則の定めによる",
  "解雇の事由・手続、自己都合退職の手続、その他詳細は当社就業規則の定めによる",
  "当社就業規則および給与規程の定めによる",
] as const;
export const DEFAULT_RETIREMENT_CLAUSE: string =
  "解雇の事由及び手続、その他詳細は就業規則の定めによる";

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

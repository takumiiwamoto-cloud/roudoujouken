import type { ClientFormValues } from "./client-form";
import type { OfficeInputValues } from "./office-input";
import { calcNetWorkMinutes } from "./minimum-wage";

/**
 * Sheet05 No.12〜18(事務所側バリデーション)の実装。
 *
 *   12 固定残業代適法性(警告): 基礎賃金 × 1.25 × 時間数 ≦ 固定残業金額
 *        - テックジャパン事件 H24.3.8 最判
 *   13 36協定整合性(警告): 固定残業時間 ≦ 36協定上限
 *        - 原則45h/月。超過時は特別条項必要
 *   14 管理監督者×残業代(警告): 管理監督者該当なのに固定残業設定がある場合の矛盾
 *   15 1年変形×労使協定(警告): 1年変形選択時の36協定届出確認
 *   16 明示事項充足(ブロック): 労働時間制区分の未選択を検知
 *   17 2024年改正項目充足(ブロック): 就業場所・業務の変更範囲、有期更新上限
 *        - 顧客側で既に必須化済みだが、念のため再チェック
 *   18 社保加入整合性(警告): 週20h以上→雇用保険、週30h以上→社保
 */

export type OfficeValidationIssue = {
  code: string;
  severity: "error" | "warning";
  title: string;
  detail?: string;
};

export type OfficeValidationResult = {
  issues: OfficeValidationIssue[];
  canGenerate: boolean;
  /** 固定残業代適法性の数値内訳(UI でリアルタイム表示用) */
  fixedOvertimeCheck: FixedOvertimeCheck | null;
};

export type FixedOvertimeCheck =
  | {
      ok: true;
      basicHourlyWage: number;
      requiredAmount: number;
      actualAmount: number;
      hours: number;
    }
  | {
      ok: false;
      basicHourlyWage: number;
      requiredAmount: number;
      actualAmount: number;
      hours: number;
    }
  | {
      skipped: true;
      reason: string;
    };

function monthlyScheduledHours(client: ClientFormValues): number | null {
  // 月所定労働時間 ≒ (日実働時間) × (年所定労働日数) / 12
  // 簡易: 始業/終業/休憩が揃っている固定時間制のみ。シフト制は事務所判断に委ねる。
  if (client.work_time_type !== "fixed") return null;
  const breakMin =
    typeof client.break_minutes === "number" ? client.break_minutes : null;
  const net = calcNetWorkMinutes(client.start_time, client.end_time, breakMin);
  if (net === null) return null;
  const dailyHours = net / 60;
  // 年間休日を簡易推定: 120日(顧客側で精緻化済み想定)
  const annualWorkDays = 365 - 120;
  return (dailyHours * annualWorkDays) / 12;
}

function basicHourlyWage(client: ClientFormValues): number | null {
  const wage = typeof client.basic_wage === "number" ? client.basic_wage : null;
  if (wage === null || wage <= 0) return null;

  if (client.wage_type === "hourly") return wage;

  if (client.wage_type === "monthly") {
    const hours = monthlyScheduledHours(client);
    if (!hours || hours <= 0) return null;
    return wage / hours;
  }
  if (client.wage_type === "daily") {
    // 日給は「1日所定時間」で割る必要があるが情報不足。スキップ。
    return null;
  }
  // daily_monthly は月換算相当。monthly と同様に扱う。
  if (client.wage_type === "daily_monthly") {
    const hours = monthlyScheduledHours(client);
    if (!hours || hours <= 0) return null;
    return wage / hours;
  }
  return null;
}

function weeklyScheduledHours(client: ClientFormValues): number | null {
  if (client.work_time_type !== "fixed") return null;
  const breakMin =
    typeof client.break_minutes === "number" ? client.break_minutes : null;
  const net = calcNetWorkMinutes(client.start_time, client.end_time, breakMin);
  if (net === null) return null;
  const dailyHours = net / 60;
  const weekdayHolidayCount = client.holidays?.includes("weekday")
    ? client.holiday_weekdays?.length ?? 0
    : 0;
  const workingDaysPerWeek = Math.max(7 - weekdayHolidayCount, 0);
  return dailyHours * workingDaysPerWeek;
}

export function validateOfficeInput(
  client: ClientFormValues | null,
  office: OfficeInputValues,
): OfficeValidationResult {
  const issues: OfficeValidationIssue[] = [];
  let fixedOvertimeCheck: FixedOvertimeCheck | null = null;

  // --- No.16 明示事項充足(ブロック) ---
  if (!office.worktime_type) {
    issues.push({
      code: "16",
      severity: "error",
      title: "労働時間制区分が未選択です",
      detail: "労基法15条の明示事項の1つ。docx 生成のため必須です。",
    });
  }

  // --- No.17 2024改正項目充足(ブロック) ---
  if (client) {
    if (!client.work_location_scope?.trim()) {
      issues.push({
        code: "17a",
        severity: "error",
        title: "就業場所の変更範囲が未入力です(2024年改正)",
        detail: "顧客入力内容を確認してください。",
      });
    }
    if (!client.job_description_scope?.trim()) {
      issues.push({
        code: "17b",
        severity: "error",
        title: "業務の変更範囲が未入力です(2024年改正)",
        detail: "顧客入力内容を確認してください。",
      });
    }
    if (
      client.has_contract_period === "yes" &&
      !client.renewal_limit_exists
    ) {
      issues.push({
        code: "17c",
        severity: "error",
        title: "有期契約の更新上限の有無が未入力です(2024年改正)",
      });
    }
  } else {
    issues.push({
      code: "17d",
      severity: "error",
      title: "顧客入力が未完了です",
      detail: "顧客が入力を完了するまで docx 生成できません。",
    });
  }

  // --- No.12 固定残業代適法性 + No.13 36協定整合性 ---
  if (office.fixed_overtime === "present") {
    const hours =
      typeof office.fixed_overtime_hours === "number"
        ? office.fixed_overtime_hours
        : null;
    const amount =
      typeof office.fixed_overtime_amount === "number"
        ? office.fixed_overtime_amount
        : null;

    if (!office.fixed_overtime_name?.trim()) {
      issues.push({
        code: "12a",
        severity: "warning",
        title: "固定残業代の名称が未入力です",
        detail: "手当名を明記してください(例: 固定残業手当)。",
      });
    }
    if (!office.fixed_overtime_excess_notice) {
      issues.push({
        code: "12b",
        severity: "warning",
        title: "超過分支払の明記にチェックが入っていません",
        detail:
          "国際自動車事件 R2.3.30 最判により、超過時の別途支払の明記が必要です。",
      });
    }

    if (hours !== null && amount !== null && client) {
      const basic = basicHourlyWage(client);
      if (basic === null) {
        fixedOvertimeCheck = {
          skipped: true,
          reason: "顧客入力の賃金または労働時間が不足しており、基礎賃金を算出できません。",
        };
      } else {
        const required = Math.ceil(basic * 1.25 * hours);
        fixedOvertimeCheck = {
          ok: amount >= required,
          basicHourlyWage: Math.round(basic),
          requiredAmount: required,
          actualAmount: amount,
          hours,
        };
        if (amount < required) {
          issues.push({
            code: "12",
            severity: "warning",
            title: "固定残業代が適法性基準を下回っています",
            detail: `基礎賃金 ${Math.round(basic).toLocaleString()} 円 × 1.25 × ${hours} 時間 = ${required.toLocaleString()} 円が必要です(現状: ${amount.toLocaleString()} 円)。テックジャパン事件 H24.3.8 最判。`,
          });
        }
      }
    } else if (hours === null || amount === null) {
      issues.push({
        code: "12c",
        severity: "warning",
        title: "固定残業代の時間数・金額が未入力です",
      });
    }

    if (hours !== null && hours > 45) {
      issues.push({
        code: "13",
        severity: "warning",
        title: "固定残業時間が月45時間を超えています",
        detail: "36協定の特別条項が必要です。届出状況をご確認ください。",
      });
    }
  }

  // --- No.14 管理監督者×残業代矛盾 ---
  if (
    office.manager_supervisor === "yes" &&
    office.fixed_overtime === "present"
  ) {
    issues.push({
      code: "14",
      severity: "warning",
      title: "管理監督者該当なのに固定残業代が設定されています",
      detail:
        "管理監督者は法律上、時間外・休日割増の対象外です(深夜割増は別)。整合を確認してください。",
    });
  }

  // --- No.15 1年変形×労使協定 ---
  if (
    office.worktime_type === "yearly_variable" &&
    office.agreement_36_status !== "filed"
  ) {
    issues.push({
      code: "15",
      severity: "warning",
      title: "1年単位の変形労働時間制は労使協定の届出が必須です",
      detail: "36協定届出状況を「届出済」に更新するか、届出を行ってください。",
    });
  }

  // --- No.18 社保加入整合性 ---
  if (client) {
    const weekly = weeklyScheduledHours(client);
    if (weekly !== null) {
      const hasHealth = client.social_insurance?.includes("health");
      const hasPension = client.social_insurance?.includes("pension");
      const hasEmployment = client.social_insurance?.includes("employment");
      if (weekly >= 20 && !hasEmployment) {
        issues.push({
          code: "18a",
          severity: "warning",
          title: "週所定労働時間が20時間以上のため雇用保険加入が必要です",
          detail: `週所定 ${weekly.toFixed(1)} 時間。顧客側の社会保険選択を確認してください。`,
        });
      }
      if (weekly >= 30 && (!hasHealth || !hasPension)) {
        issues.push({
          code: "18b",
          severity: "warning",
          title: "週所定労働時間が30時間以上のため健康保険・厚生年金加入が必要です",
          detail: `週所定 ${weekly.toFixed(1)} 時間。顧客側の社会保険選択を確認してください。`,
        });
      }
    }
  }

  return {
    issues,
    canGenerate: issues.every((i) => i.severity !== "error"),
    fixedOvertimeCheck,
  };
}

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

export type OfficeValidationContext = {
  /** contract_requests.company_address(値の妥当性警告に使用) */
  company_address?: string;
};

/**
 * 業務内容・就業場所などの自由記述欄で「正当な短文回答」として
 * 文字数・意味不明チェックをスキップするホワイトリスト。
 *
 * これらはいずれも実務で頻出する正当な回答のため、
 * 2文字未満・意味不明ヒューリスティックの対象外とする。
 */
const SHORT_ANSWER_WHITELIST = new Set<string>([
  "なし",
  "変更なし",
  "異動なし",
  "転勤なし",
  "該当なし",
  "特になし",
  "本社のみ",
  "就業場所に同じ",
  "雇入れ時と同じ",
]);

function isWhitelistedShortAnswer(raw: string): boolean {
  return SHORT_ANSWER_WHITELIST.has(raw.trim());
}

const KEYBOARD_SEQUENCES = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
  "abcdefghijklmnopqrstuvwxyz",
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
];

/**
 * 日本語の必須記載欄に対して「意味不明な入力」を検知するヒューリスティック。
 * ホワイトリストや文字数チェックは呼び出し側で別途適用すること。
 *
 * 判定基準:
 *   - 半角英数字のみで構成されている("sdf", "das", "123" など)
 *   - 半角カナのみ("ｻｼｽｾｿ")
 *   - 全角英数字のみ("ｆｓｄ", "ｄｓふぁ"のうち英数字部分だけ、"１２３ＡＢＣ" など)
 *   - 半角英数字と全角英数字が混在し、日本語(CJK/かな)を含まない("ｄsｆ" 等)
 *   - 半角カナ or 半角英字 と 日本語(CJK/ひらがな/カタカナ)が混在("さｆ", "ふぁｓｄ")
 *   - 同一文字の連続4文字以上("ああああ", "aaaa")
 *   - 5文字以上のキーボード/五十音配列連続("asdfg", "qwerty", "あいうえお")
 */
function looksMeaninglessInput(raw: string): boolean {
  const s = raw.trim();
  if (s.length === 0) return false;

  // 半角英数字のみ / 半角カナのみ / 全角英数字のみ
  if (/^[A-Za-z0-9]+$/.test(s)) return true;
  if (/^[\uFF66-\uFF9F]+$/.test(s)) return true;
  if (/^[\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19]+$/.test(s)) return true;

  const HALF_ALNUM = /[A-Za-z0-9]/;
  const FULL_ALNUM = /[\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19]/;
  const HALF_KANA = /[\uFF66-\uFF9F]/;
  const CJK = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

  // 半角英数字 × 全角英数字 の混在で日本語を含まない("ｄsｆ" 等)
  if (
    HALF_ALNUM.test(s) &&
    FULL_ALNUM.test(s) &&
    !CJK.test(s) &&
    !HALF_KANA.test(s)
  ) {
    return true;
  }

  // 半角英字/半角カナ × 日本語 の混在("さｆ", "ふぁｓｄ")
  const HALF = /[A-Za-z\uFF66-\uFF9F]/;
  if (HALF.test(s) && CJK.test(s)) return true;

  if (/^(.)\1{3,}$/.test(s)) return true;

  if (s.length >= 5) {
    const lower = s.toLowerCase();
    for (const seq of KEYBOARD_SEQUENCES) {
      if (seq.includes(lower) || seq.includes(s)) return true;
    }
  }

  return false;
}

const MEANINGLESS_DETAIL =
  "入力内容が意味のある日本語として認識できません。具体的な内容を記載してください。";

export function validateOfficeInput(
  client: ClientFormValues | null,
  office: OfficeInputValues,
  ctx?: OfficeValidationContext,
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
  // 顧客側 has_fixed_overtime が選択されていれば優先。レガシーは office.fixed_overtime。
  const effectiveHasFixedOvertime =
    client?.has_fixed_overtime !== undefined
      ? client.has_fixed_overtime === "yes"
      : office.fixed_overtime === "present";
  if (effectiveHasFixedOvertime) {
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
        severity: "error",
        title: "固定残業代の名称が未入力です",
        detail: "固定残業代ありの場合、名称は必須です(例: 固定残業手当)。",
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
        severity: "error",
        title: "固定残業代の時間数・金額が未入力です",
        detail: "固定残業代ありの場合、時間数と金額は必須です。",
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
    effectiveHasFixedOvertime
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

  // --- 値域の妥当性警告(typo 検知・誤入力対策) ---
  if (client) {
    // 基本賃金: 500万円超は「単位違い(年額入力)」の可能性が高い
    if (
      typeof client.basic_wage === "number" &&
      client.basic_wage > 5_000_000
    ) {
      const unit =
        client.wage_type === "hourly"
          ? "時給"
          : client.wage_type === "daily"
            ? "日給"
            : "月給";
      issues.push({
        code: "V-wage",
        severity: "warning",
        title: "基本賃金の金額が異常に高い可能性があります",
        detail: `${unit}として ${client.basic_wage.toLocaleString()} 円が入力されています。桁や単位(年額/月額)をご確認ください。`,
      });
    }

    // --- 労基法15条・施行規則5条の絶対的明示事項(未入力・意味不明はブロック) ---

    // 業務内容(雇入れ直後)
    const jobInit = client.job_description_initial?.trim() ?? "";
    if (jobInit.length === 0) {
      issues.push({
        code: "V-job-empty",
        severity: "error",
        title: "業務内容(雇入れ直後)が未入力です",
        detail: "労基法15条・施行規則5条の絶対的明示事項。顧客に入力を依頼してください。",
      });
    } else if (!isWhitelistedShortAnswer(jobInit)) {
      if (jobInit.length < 2) {
        issues.push({
          code: "V-job-short",
          severity: "error",
          title: "業務内容の記載が短すぎます",
          detail: `「${jobInit}」のみが入力されています。労基法15条の明示義務を満たすため、2文字以上で具体的に記載してください。`,
        });
      } else if (looksMeaninglessInput(jobInit)) {
        issues.push({
          code: "V-job-meaningless",
          severity: "error",
          title: "業務内容が意味のある日本語になっていません",
          detail: `「${jobInit}」が入力されています。${MEANINGLESS_DETAIL}`,
        });
      }
    }

    // 就業場所(雇入れ直後)
    const locInit = client.work_location_initial?.trim() ?? "";
    if (locInit.length === 0) {
      issues.push({
        code: "V-loc-empty",
        severity: "error",
        title: "就業場所(雇入れ直後)が未入力です",
        detail: "労基法15条・施行規則5条の絶対的明示事項。顧客に入力を依頼してください。",
      });
    } else if (!isWhitelistedShortAnswer(locInit)) {
      if (locInit.length < 2) {
        issues.push({
          code: "V-loc-short",
          severity: "error",
          title: "就業場所(雇入れ直後)の記載が短すぎます",
          detail: `「${locInit}」のみが入力されています。事業所名・住所など2文字以上で具体的に記載してください。`,
        });
      } else if (looksMeaninglessInput(locInit)) {
        issues.push({
          code: "V-loc-meaningless",
          severity: "error",
          title: "就業場所(雇入れ直後)が意味のある日本語になっていません",
          detail: `「${locInit}」が入力されています。${MEANINGLESS_DETAIL}`,
        });
      }
    }

    // 就業場所(変更の範囲・2024年改正) — No.17a で既に error チェック済み。
    // 「なし」「本社のみ」等の正当な短文回答はホワイトリストで許容。
    const locScope = client.work_location_scope?.trim() ?? "";
    if (locScope.length > 0 && !isWhitelistedShortAnswer(locScope)) {
      if (locScope.length < 2) {
        issues.push({
          code: "V-loc-scope-short",
          severity: "warning",
          title: "就業場所(変更の範囲)の記載が短すぎる可能性があります",
          detail: `「${locScope}」のみが入力されています。「なし」等の正当な回答でなければ、具体的な範囲を記載してください。`,
        });
      } else if (looksMeaninglessInput(locScope)) {
        issues.push({
          code: "V-loc-scope-meaningless",
          severity: "warning",
          title: "就業場所(変更の範囲)が意味のある日本語になっていません",
          detail: `「${locScope}」が入力されています。${MEANINGLESS_DETAIL}`,
        });
      }
    }

  }

  // 会社所在地の妥当性(警告)
  if (ctx?.company_address) {
    const addr = ctx.company_address.trim();
    if (addr.length > 0 && addr.length < 7) {
      issues.push({
        code: "V-addr-len",
        severity: "warning",
        title: "会社所在地が短すぎる可能性があります",
        detail: `「${addr}」が入力されています。都道府県・市区町村・番地まで含まれているか確認してください。`,
      });
    }
    if (addr.length > 0 && !/[0-90-9]/.test(addr)) {
      issues.push({
        code: "V-addr-num",
        severity: "warning",
        title: "会社所在地に番地の数字が含まれていない可能性があります",
        detail: "丁目・番地の記載をご確認ください。",
      });
    }
  }

  // --- 退職関連 ---
  // 定年(正社員)・退職事項は未入力時、docx 生成時に既定文言
  // (満60歳の誕生月末日 / 就業規則の定めによる)で自動補完するため、
  // バリデーションでのエラー/警告は発生させない。
  // 個別の定めがある場合は顧客入力タブから訂正する運用。

  if (!office.self_retirement_notice_period?.trim()) {
    issues.push({
      code: "V-self-retire",
      severity: "warning",
      title: "自己都合退職の予告期間が未選択です",
      detail:
        "民法627条は原則2週間前の申出。就業規則で別途定めがある場合はそれを選択してください。",
    });
  }

  // 労基法56条・57条(年少者)の自動チェックは birth_date を扱わなくなったため削除。
  // 社労士の目視確認に委ねる。

  return {
    issues,
    canGenerate: issues.every((i) => i.severity !== "error"),
    fixedOvertimeCheck,
  };
}

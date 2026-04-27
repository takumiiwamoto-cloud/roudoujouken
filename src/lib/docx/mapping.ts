import {
  DEFAULT_RETIREMENT_AGE,
  DEFAULT_RETIREMENT_CLAUSE,
  type ClientFormValues,
} from "@/lib/validations/client-form";
import type { OfficeInputValues } from "@/lib/validations/office-input";
import { calcNetWorkMinutes } from "@/lib/validations/minimum-wage";
import {
  buildAllowanceDescription,
  normalizeAllowanceEntry,
} from "@/lib/allowances";

/**
 * Sheet06「docx差し込みタグ一覧」に完全準拠したタグマッピング。
 *
 * 入力: 会社情報 + client_input + office_input
 * 出力: docxtemplater に渡すプレーンオブジェクト
 *
 * 条件分岐タグ(真偽値):
 *   - has_probation           試用期間あり
 *   - probation_has_diff      試用期間中の労働条件差異あり
 *   - is_shift_work           シフト制
 *   - uses_variable_working_hours 変形労働時間制を適用
 *   - has_fixed_overtime      固定残業代あり
 *   - has_remarks             備考あり
 *
 * 配列タグ(ループ):
 *   - allowances        [{ allowance_name, allowance_description, allowance_amount }]
 *                       allowance_description: 支給パターンから生成した最終文言
 *                       allowance_amount: レガシー互換用(月額固定等の円表記)
 *                       通勤手当は client.commute_allowance から合成して末尾に追加
 *   - social_insurance  [{ insurance_name }]
 *
 * ひな形選択はファイル分岐で行う(has_contract_period ブロックは使わない):
 *   - 正社員 → 労働条件通知書_ひな形_正社員.docx
 *   - 契約社員 → 労働条件通知書_ひな形_契約社員.docx
 *   - パート無期 → 労働条件通知書_ひな形_パート無期.docx
 *   - パート有期 → 労働条件通知書_ひな形_パート有期.docx
 */

export type DocxContextInput = {
  companyName: string;
  companyAddress: string;
  representativeName: string;
  client: ClientFormValues;
  office: OfficeInputValues;
  now?: Date;
};

export type DocxContext = Record<string, unknown>;

const EMPLOYMENT_TYPE: Record<string, string> = {
  seishain: "正社員",
  keiyaku: "契約社員",
  part: "パート・アルバイト",
};
const RENEWAL_TYPE: Record<string, string> = {
  auto: "自動更新",
  maybe: "更新する場合あり",
  no: "更新しない",
};
const YES_NO: Record<string, string> = {
  yes: "有",
  no: "無",
};
const WAGE_TYPE: Record<string, string> = {
  monthly: "月給",
  daily_monthly: "日給月給",
  hourly: "時給",
  daily: "日給",
};
const PAYMENT_METHOD: Record<string, string> = {
  bank_transfer: "本人が指定した金融機関口座への振込",
  cash: "現金手渡し",
};
const PAYMENT_CUTOFF: Record<string, string> = {
  end: "月末",
  "10": "毎月10日",
  "15": "毎月15日",
  "20": "毎月20日",
  "25": "毎月25日",
};
const WEEKDAY: Record<string, string> = {
  mon: "月",
  tue: "火",
  wed: "水",
  thu: "木",
  fri: "金",
  sat: "土",
  sun: "日",
};
const SOCIAL_INSURANCE: Record<string, string> = {
  health: "健康保険",
  pension: "厚生年金",
  employment: "雇用保険",
  rousai: "労災保険",
};
const WORKTIME_TYPE: Record<string, string> = {
  normal: "",
  monthly_variable: "1ヶ月単位の変形労働時間制",
  yearly_variable: "1年単位の変形労働時間制",
  flextime: "フレックスタイム制",
  outside: "事業場外みなし労働時間制",
  discretionary: "専門業務型裁量労働制",
};

function formatDateJa(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatNowJa(now: Date): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

/** 通貨: 数値 → 3桁カンマ区切り。ひな形側に「円」が記載されている前提で単位は付けない。 */
function money(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}

/** 数値 → 3桁カンマ区切り(単位なし)。整数/小数どちらにも対応。 */
function num(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** 諸手当(円表記あり)※ allowance_amount はひな形側に「円」が無いため円付きで出力。 */
function yenWithUnit(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return `${n.toLocaleString("en-US")}円`;
}

const DEFAULT_LEAVE_CLAUSE = "年次有給休暇、就業規則に定める特別休暇";

function buildHolidaysText(client: ClientFormValues): string {
  const parts: string[] = [];
  if (client.holidays?.includes("weekday") && client.holiday_weekdays?.length) {
    parts.push(
      client.holiday_weekdays.map((w) => WEEKDAY[w] ?? w).join("・") + "曜日",
    );
  }
  if (client.holidays?.includes("shift")) parts.push("シフト制による");
  if (client.holidays?.includes("other")) parts.push("その他");
  return parts.join("、");
}

/** 1日所定労働時間(単位なし)。ひな形側に「時間」が記載されている前提。 */
function dailyWorkHours(client: ClientFormValues): string {
  if (client.work_time_type !== "fixed") return "";
  const breakMin =
    typeof client.break_minutes === "number" ? client.break_minutes : null;
  const net = calcNetWorkMinutes(client.start_time, client.end_time, breakMin);
  if (net === null) return "";
  return num(net / 60);
}

/** 1週所定労働時間(単位なし)。 */
function weeklyWorkHours(client: ClientFormValues): string {
  if (client.work_time_type !== "fixed") return "";
  const breakMin =
    typeof client.break_minutes === "number" ? client.break_minutes : null;
  const net = calcNetWorkMinutes(client.start_time, client.end_time, breakMin);
  if (net === null) return "";
  const dailyHours = net / 60;
  const weekdayHolidayCount = client.holidays?.includes("weekday")
    ? client.holiday_weekdays?.length ?? 0
    : 0;
  const workingDaysPerWeek = Math.max(7 - weekdayHolidayCount, 0);
  return num(dailyHours * workingDaysPerWeek);
}

function buildVariableDetail(office: OfficeInputValues): string {
  if (office.worktime_type === "yearly_variable") {
    const lines: string[] = [];
    if (office.yearly_variable_target_period) {
      lines.push(`対象期間: ${office.yearly_variable_target_period}`);
    }
    if (office.yearly_variable_special_period) {
      lines.push(`特定期間: ${office.yearly_variable_special_period}`);
    }
    return lines.join("\n");
  }
  if (office.worktime_type === "flextime") {
    const lines: string[] = [];
    if (office.flextime_settlement_period) {
      lines.push(`清算期間: ${office.flextime_settlement_period}`);
    }
    if (office.flextime_core_time) {
      lines.push(`コアタイム: ${office.flextime_core_time}`);
    }
    return lines.join("\n");
  }
  return "";
}

function buildAllowances(client: ClientFormValues): Array<{
  allowance_name: string;
  allowance_description: string;
  allowance_amount: string;
}> {
  const result: Array<{
    allowance_name: string;
    allowance_description: string;
    allowance_amount: string;
  }> = [];

  if (Array.isArray(client.allowances) && client.has_allowances === "yes") {
    for (const raw of client.allowances) {
      if (!raw) continue;
      const item = normalizeAllowanceEntry(raw);
      const description =
        (raw as { allowance_description?: string }).allowance_description ??
        buildAllowanceDescription(item);
      if (!item.allowance_name && !description) continue;
      result.push({
        allowance_name: item.allowance_name,
        allowance_description: description,
        // レガシーテンプレート互換のため、月額固定・扶養家族定額等で金額が
        // あれば従来タグ allowance_amount にも値を供給する。
        allowance_amount: yenWithUnit(item.allowance_amount),
      });
    }
  }

  // 旧スキーマ互換: commute_allowance が単独フィールドに入っているレガシーデータの場合、
  // allowances 配列側に 通勤手当 が無ければ末尾に追加する(二重表示の防止)。
  const hasCommuteInList = result.some((r) => r.allowance_name === "通勤手当");
  if (
    !hasCommuteInList &&
    typeof client.commute_allowance === "number" &&
    client.commute_allowance > 0
  ) {
    const amt = client.commute_allowance;
    result.push({
      allowance_name: "通勤手当",
      allowance_description: `月額${amt.toLocaleString("en-US")}円`,
      allowance_amount: yenWithUnit(amt),
    });
  }

  return result;
}

export function buildDocxContext(input: DocxContextInput): DocxContext {
  const { companyName, companyAddress, representativeName, client, office } =
    input;
  const now = input.now ?? new Date();

  const employeeName = [client.last_name, client.first_name]
    .filter((s): s is string => !!s?.trim())
    .join("　");

  const usesVariable =
    !!office.worktime_type && office.worktime_type !== "normal";

  const paymentCutoff =
    client.payment_cutoff_day === "other"
      ? client.payment_cutoff_other ?? ""
      : PAYMENT_CUTOFF[client.payment_cutoff_day] ?? "";

  return {
    // --- ヘッダー(全種共通) ---
    company_name: companyName,
    company_address: companyAddress,
    representative_name: representativeName,
    contract_date: formatNowJa(now),

    // --- 労働者 ---
    employee_name: employeeName,

    // --- 雇用形態 ---
    employment_type: EMPLOYMENT_TYPE[client.employment_type] ?? "",

    // --- 契約期間(ひな形側でファイル分岐するため has_contract_period は使わない) ---
    contract_start_date: formatDateJa(client.contract_start_date),
    contract_end_date: formatDateJa(client.contract_end_date),
    renewal_type: client.renewal_type ? RENEWAL_TYPE[client.renewal_type] : "",
    renewal_limit_exists: client.renewal_limit_exists
      ? YES_NO[client.renewal_limit_exists]
      : "",
    renewal_limit_content: client.renewal_limit_content ?? "",

    // --- 試用期間(条件分岐 + 差異ブロック) ---
    has_probation: client.has_probation === "yes",
    probation_period: client.probation_period ?? "",
    probation_has_diff: office.probation_difference === "different",
    probation_wage: office.probation_wage ?? "",
    probation_other_conditions: office.probation_work_conditions ?? "",

    // --- 就業場所・業務 ---
    work_location_initial: client.work_location_initial ?? "",
    work_location_scope: client.work_location_scope ?? "",
    job_description_initial: client.job_description_initial ?? "",
    job_description_scope: client.job_description_scope ?? "",

    // --- 労働時間(シフト/固定 + 変形) ---
    is_shift_work: client.work_time_type === "shift",
    shift_note: client.shift_note ?? "",
    start_time: client.start_time ?? "",
    end_time: client.end_time ?? "",
    // ひな形側に「分」「時間」が既に記載されているため単位なしで出力。
    break_minutes: num(
      typeof client.break_minutes === "number" ? client.break_minutes : null,
    ),
    daily_work_hours: dailyWorkHours(client),
    weekly_work_hours: weeklyWorkHours(client),
    overtime_type: office.overtime_type ? YES_NO[office.overtime_type] : "",
    uses_variable_working_hours: usesVariable,
    variable_working_hours_type: office.worktime_type
      ? WORKTIME_TYPE[office.worktime_type]
      : "",
    variable_working_hours_detail: buildVariableDetail(office),

    // --- 休日・休暇 ---
    holidays: buildHolidaysText(client),
    leave_clause: office.leave_clause?.trim() || DEFAULT_LEAVE_CLAUSE,

    // --- 賃金(単位は全てひな形側に記載されている前提で数値のみ出力) ---
    wage_type: WAGE_TYPE[client.wage_type] ?? "",
    basic_wage: money(
      typeof client.basic_wage === "number" ? client.basic_wage : null,
    ),
    allowances: buildAllowances(client),

    // --- 固定残業代(単位なし・カンマ区切り) ---
    has_fixed_overtime: office.fixed_overtime === "present",
    fixed_overtime_name: office.fixed_overtime_name ?? "",
    fixed_overtime_amount: money(
      typeof office.fixed_overtime_amount === "number"
        ? office.fixed_overtime_amount
        : null,
    ),
    fixed_overtime_hours: num(
      typeof office.fixed_overtime_hours === "number"
        ? office.fixed_overtime_hours
        : null,
    ),

    // --- 賃金支払 ---
    payment_cutoff_day: paymentCutoff,
    payment_date: client.payment_date ?? "",
    payment_method: PAYMENT_METHOD[client.payment_method] ?? "",
    salary_increase: client.salary_increase ?? "",
    bonus: client.bonus ?? "",
    retirement_allowance: client.retirement_allowance ?? "",

    // --- 退職(未入力の旧データ向けの最終フォールバック。UI では既定値が必ず入る) ---
    retirement_age:
      client.retirement_age?.trim() ||
      (client.employment_type === "seishain" ? DEFAULT_RETIREMENT_AGE : ""),
    retirement_clause:
      client.retirement_clause?.trim() || DEFAULT_RETIREMENT_CLAUSE,
    self_retirement_notice_period: office.self_retirement_notice_period ?? "",

    // --- 社会保険 ---
    social_insurance: (client.social_insurance ?? []).map((v) => ({
      insurance_name: SOCIAL_INSURANCE[v] ?? v,
    })),

    // --- その他(consultation_contact は未入力時に代表者名を使う) ---
    consultation_contact:
      office.consultation_contact?.trim() || representativeName,
    work_rules_location: office.work_rules_location ?? "",
    has_remarks: !!client.remarks?.trim(),
    remarks: client.remarks ?? "",
  };
}

/**
 * 雇用形態 + 契約期間有無 → ひな形ファイル名
 */
export function resolveTemplateFileName(
  client: ClientFormValues,
): string | null {
  const et = client.employment_type;
  const isFixedTerm = client.has_contract_period === "yes";

  if (et === "seishain") return "労働条件通知書_ひな形_正社員.docx";
  if (et === "keiyaku") return "労働条件通知書_ひな形_契約社員.docx";
  if (et === "part") {
    return isFixedTerm
      ? "労働条件通知書_ひな形_パート有期.docx"
      : "労働条件通知書_ひな形_パート無期.docx";
  }
  return null;
}

/** 生成物ファイル名用の雇用形態スラッグ(表示用・日本語) */
export function resolveEmploymentSlug(client: ClientFormValues): string {
  const et = client.employment_type;
  if (et === "seishain") return "正社員";
  if (et === "keiyaku") return "契約社員";
  if (et === "part")
    return client.has_contract_period === "yes" ? "パート有期" : "パート無期";
  return "契約書";
}

/**
 * Storage オブジェクトキー用の ASCII スラッグ。
 * Supabase Storage はキーに ASCII 英数と一部記号しか許容しない。
 */
export function resolveEmploymentAsciiSlug(client: ClientFormValues): string {
  const et = client.employment_type;
  if (et === "seishain") return "seishain";
  if (et === "keiyaku") return "keiyaku";
  if (et === "part")
    return client.has_contract_period === "yes" ? "part_fixed" : "part_indefinite";
  return "contract";
}

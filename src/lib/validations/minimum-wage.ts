/**
 * 最低賃金チェック関連のユーティリティ。
 *
 * 設計書 Sheet05 No.6/No.7 に対応。
 *
 * Sheet02 には「都道府県」「年間休日数」を取る項目がないため、
 *   - 都道府県: 会社所在地(company_address)の先頭から正規表現で抽出(※)
 *   - 年間休日数: 休日設定(holidays / holiday_weekdays)から推定
 * として実装している。設計書に明記のない判断のため、本ファイル冒頭のコメント
 * でルートを記述しておく(プロンプト3-B 着手時にユーザー合意済)。
 *
 * ※ 最賃法は事業場所在地基準。労働者住所(address)ではなく会社所在地を採用。
 */

// ---------------------------------------------------------------------------
// 都道府県抽出
// ---------------------------------------------------------------------------

/**
 * 住所文字列の先頭から都道府県名を取り出す。
 * マッチしなければ null。先頭の空白は除去してから判定する。
 */
export function extractPrefecture(address: string | null | undefined): string | null {
  if (!address) return null;
  const s = address.trim();
  // 「東京都」「北海道」「大阪府」「京都府」「◯◯県」の5パターン
  const m = s.match(/^(東京都|北海道|(?:大阪|京都)府|..県)/);
  if (!m) return null;
  // マスタ側の PK は「東京」「北海道」「大阪」「京都」「神奈川」… のように
  // 末尾の「都/道/府/県」を取り除いた形で保存している(ただし「北海道」は丸ごと)
  const withSuffix = m[1];
  if (withSuffix === "北海道") return "北海道";
  return withSuffix.replace(/(都|府|県)$/, "");
}

// ---------------------------------------------------------------------------
// 年間休日数の推定
// ---------------------------------------------------------------------------

/**
 * 年間休日数のデフォルト値。設計書に記載がないため以下の根拠で採用:
 *   - JAPANESE_PUBLIC_HOLIDAYS_PER_YEAR = 16
 *     2025年の「国民の祝日」16日(内閣府公表)を目安。年により±1程度のブレあり。
 *   - SHIFT_DEFAULT_ANNUAL_HOLIDAYS = 120
 *     中小企業の平均年間休日数の中央値付近。事務所側(O-03)で上書き可能な前提。
 *   - OTHER_DEFAULT_ANNUAL_HOLIDAYS = 120
 *     同上(「その他」選択時は顧客の詳細が読めないため安全側)。
 */
const JAPANESE_PUBLIC_HOLIDAYS_PER_YEAR = 16;
const SHIFT_DEFAULT_ANNUAL_HOLIDAYS = 120;
const OTHER_DEFAULT_ANNUAL_HOLIDAYS = 120;

/**
 * 休日設定から年間休日数を推定する。
 * - 曜日指定(weekday) かつ holiday_weekdays 選択あり:
 *     52 × 選択曜日数 + 祝日16日(ただし土日選択時は祝日が土日と重なる可能性を
 *     簡便化のため無視。実務上は事務所側で精緻化可能)
 * - シフト制(shift): 120日(固定デフォルト)
 * - その他(other): 120日(固定デフォルト)
 * いずれも該当しなければ null を返す(=最賃チェックをスキップ)。
 */
export function estimateAnnualHolidays(
  holidays: readonly string[] | undefined,
  holidayWeekdays: readonly string[] | undefined,
): number | null {
  if (!holidays || holidays.length === 0) return null;

  if (holidays.includes("weekday")) {
    const n = holidayWeekdays?.length ?? 0;
    if (n === 0) return null;
    return 52 * n + JAPANESE_PUBLIC_HOLIDAYS_PER_YEAR;
  }
  if (holidays.includes("shift")) {
    return SHIFT_DEFAULT_ANNUAL_HOLIDAYS;
  }
  if (holidays.includes("other")) {
    return OTHER_DEFAULT_ANNUAL_HOLIDAYS;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 時刻・休憩の計算
// ---------------------------------------------------------------------------

/** "HH:MM" を分に変換。不正なら null。 */
export function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 47 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * 始業〜終業の拘束時間(分)を返す。深夜またぎ(終業が翌日)は終業に24h加算。
 */
export function calcWorkDurationMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null {
  const s = parseHHMM(startTime);
  const e = parseHHMM(endTime);
  if (s === null || e === null) return null;
  const raw = e - s;
  if (raw <= 0) return raw + 24 * 60; // 日跨ぎ勤務
  return raw;
}

/**
 * 実労働時間(分) = 拘束時間 - 休憩時間。
 */
export function calcNetWorkMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  breakMinutes: number | null | undefined,
): number | null {
  const gross = calcWorkDurationMinutes(startTime, endTime);
  if (gross === null) return null;
  const br = breakMinutes ?? 0;
  return gross - br;
}

// ---------------------------------------------------------------------------
// 月所定時間・時給換算
// ---------------------------------------------------------------------------

/**
 * 月所定時間(h) = 実労働時間(h/日) × 年間出勤日数 ÷ 12。
 * 年間出勤日数 = 365 - 年間休日数。
 * いずれかの引数が揃わなければ null(= 最賃チェックスキップ)。
 */
export function calcMonthlyWorkHours(params: {
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  breakMinutes: number | null | undefined;
  annualHolidays: number | null | undefined;
}): number | null {
  const net = calcNetWorkMinutes(
    params.startTime,
    params.endTime,
    params.breakMinutes,
  );
  if (net === null || net <= 0) return null;
  const ah = params.annualHolidays;
  if (ah === null || ah === undefined) return null;
  const workingDays = 365 - ah;
  if (workingDays <= 0) return null;
  return (net / 60) * workingDays / 12;
}

/**
 * 月給 → 時給換算。
 */
export function toHourlyFromMonthly(
  monthlyWage: number,
  monthlyHours: number,
): number {
  return monthlyWage / monthlyHours;
}

// ---------------------------------------------------------------------------
// 最低賃金チェック
// ---------------------------------------------------------------------------

export type MinimumWageCheckResult =
  | { ok: true; hourlyEquiv: number; threshold: number; prefecture: string }
  | {
      ok: false;
      reason: "below_minimum";
      hourlyEquiv: number;
      threshold: number;
      prefecture: string;
    }
  | { ok: true; skipped: true; reason: SkipReason };

type SkipReason =
  | "no_prefecture" // 会社所在地から都道府県抽出できず
  | "no_minimum_wage_for_prefecture" // マスタに未登録
  | "shift_monthly_indeterminate" // シフト制×月給で拘束時間取れず
  | "missing_inputs"; // 必須項目未入力のためスキップ

/**
 * 月給の最賃チェック。
 * 必要入力が揃わない場合は skipped:true で返し、UI 側で注意表示に切替可能にする。
 */
export function checkMonthlyWage(params: {
  prefecture: string | null;
  minimumWage: number | null;
  basicWage: number;
  monthlyHours: number | null;
}): MinimumWageCheckResult {
  if (!params.prefecture) {
    return { ok: true, skipped: true, reason: "no_prefecture" };
  }
  if (params.minimumWage === null) {
    return { ok: true, skipped: true, reason: "no_minimum_wage_for_prefecture" };
  }
  if (params.monthlyHours === null) {
    return { ok: true, skipped: true, reason: "shift_monthly_indeterminate" };
  }
  const hourly = toHourlyFromMonthly(params.basicWage, params.monthlyHours);
  if (hourly < params.minimumWage) {
    return {
      ok: false,
      reason: "below_minimum",
      hourlyEquiv: hourly,
      threshold: params.minimumWage,
      prefecture: params.prefecture,
    };
  }
  return {
    ok: true,
    hourlyEquiv: hourly,
    threshold: params.minimumWage,
    prefecture: params.prefecture,
  };
}

/**
 * 時給の最賃チェック。
 */
export function checkHourlyWage(params: {
  prefecture: string | null;
  minimumWage: number | null;
  hourlyWage: number;
}): MinimumWageCheckResult {
  if (!params.prefecture) {
    return { ok: true, skipped: true, reason: "no_prefecture" };
  }
  if (params.minimumWage === null) {
    return { ok: true, skipped: true, reason: "no_minimum_wage_for_prefecture" };
  }
  if (params.hourlyWage < params.minimumWage) {
    return {
      ok: false,
      reason: "below_minimum",
      hourlyEquiv: params.hourlyWage,
      threshold: params.minimumWage,
      prefecture: params.prefecture,
    };
  }
  return {
    ok: true,
    hourlyEquiv: params.hourlyWage,
    threshold: params.minimumWage,
    prefecture: params.prefecture,
  };
}

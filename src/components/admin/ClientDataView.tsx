import type { ClientFormValues } from "@/lib/validations/client-form";

/**
 * 顧客入力(client_input)を読み取り専用で表示。
 *
 * Sheet02 の 45 項目を 7 セクションで構造化。未入力(pending)時は待機表示。
 * 表示ラベルは japanese. 値の enum → 日本語変換は下部のマップで行う。
 */

const EMPLOYMENT_TYPE: Record<string, string> = {
  seishain: "正社員",
  keiyaku: "契約社員",
  part: "パート・アルバイト",
};
const GENDER: Record<string, string> = {
  male: "男性",
  female: "女性",
  no_answer: "回答しない",
};
const YES_NO: Record<string, string> = {
  yes: "あり",
  no: "なし",
};
const RENEWAL_TYPE: Record<string, string> = {
  auto: "自動更新",
  maybe: "更新する場合あり",
  no: "更新なし",
};
const WORK_TIME_TYPE: Record<string, string> = {
  fixed: "固定時間制",
  shift: "シフト制",
};
const WAGE_TYPE: Record<string, string> = {
  monthly: "月給",
  daily_monthly: "日給月給",
  hourly: "時給",
  daily: "日給",
};
const PAYMENT_METHOD: Record<string, string> = {
  bank_transfer: "銀行振込",
  cash: "現金手渡し",
};
const PAYMENT_CUTOFF: Record<string, string> = {
  end: "月末",
  "15": "15日",
  "20": "20日",
  other: "その他",
};
const REMOTE_WORK: Record<string, string> = {
  yes: "あり",
  no: "なし",
};
const HOLIDAY_TYPE: Record<string, string> = {
  weekday: "曜日指定",
  shift: "シフト",
  other: "その他",
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

function mapList(
  values: readonly string[] | undefined,
  dict: Record<string, string>,
) {
  if (!values || values.length === 0) return "-";
  return values.map((v) => dict[v] ?? v).join(" / ");
}

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string" && v.trim() === "") return "-";
  return String(v);
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 border-b py-2 text-sm last:border-b-0 md:grid-cols-[12rem_1fr]">
      <div className="text-muted-foreground">{label}</div>
      <div className="whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4 md:p-5">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div>{children}</div>
    </section>
  );
}

export function ClientDataView({
  client,
}: {
  client: ClientFormValues | null;
}) {
  if (!client) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        顧客入力はまだ完了していません。URL をお送りした顧客の入力をお待ちください。
      </div>
    );
  }

  const allowances =
    Array.isArray(client.allowances) && client.allowances.length > 0
      ? client.allowances
          .filter((a) => a?.name || a?.amount)
          .map((a) =>
            `${a?.name ?? "-"}${a?.amount ? ` : ${Number(a.amount).toLocaleString()}円` : ""}`,
          )
          .join("\n")
      : "-";

  return (
    <div className="space-y-4">
      <Section title="1. 労働者基本情報">
        <Row label="氏名">
          {fmt(client.last_name)} {fmt(client.first_name)}
        </Row>
        <Row label="フリガナ">
          {fmt(client.last_name_kana)} {fmt(client.first_name_kana)}
        </Row>
        <Row label="生年月日">{fmt(client.birth_date)}</Row>
        <Row label="性別">
          {fmt(client.gender ? GENDER[client.gender] : "")}
        </Row>
        <Row label="郵便番号">{fmt(client.postal_code)}</Row>
        <Row label="住所">{fmt(client.address)}</Row>
        <Row label="電話番号">{fmt(client.phone)}</Row>
        <Row label="メール">{fmt(client.email)}</Row>
      </Section>

      <Section title="2. 雇用区分・契約期間">
        <Row label="雇用形態">
          {fmt(EMPLOYMENT_TYPE[client.employment_type])}
        </Row>
        <Row label="契約期間の定め">
          {fmt(YES_NO[client.has_contract_period])}
        </Row>
        <Row label="契約開始日">{fmt(client.contract_start_date)}</Row>
        <Row label="契約終了日">{fmt(client.contract_end_date)}</Row>
        <Row label="更新の有無">
          {fmt(client.renewal_type ? RENEWAL_TYPE[client.renewal_type] : "")}
        </Row>
        <Row label="更新上限の有無">
          {fmt(
            client.renewal_limit_exists
              ? YES_NO[client.renewal_limit_exists]
              : "",
          )}
        </Row>
        <Row label="更新上限の内容">
          {fmt(client.renewal_limit_content)}
        </Row>
        <Row label="試用期間">
          {fmt(YES_NO[client.has_probation])}
          {client.has_probation === "yes" && client.probation_period
            ? ` / ${client.probation_period}`
            : ""}
        </Row>
      </Section>

      <Section title="3. 就業場所(2024年改正対応)">
        <Row label="雇入れ直後">{fmt(client.work_location_initial)}</Row>
        <Row label="変更の範囲">{fmt(client.work_location_scope)}</Row>
        <Row label="在宅勤務">
          {fmt(client.remote_work ? REMOTE_WORK[client.remote_work] : "")}
        </Row>
      </Section>

      <Section title="4. 業務内容(2024年改正対応)">
        <Row label="雇入れ直後">{fmt(client.job_description_initial)}</Row>
        <Row label="変更の範囲">{fmt(client.job_description_scope)}</Row>
      </Section>

      <Section title="5. 所定労働時間・休日">
        <Row label="労働時間タイプ">
          {fmt(WORK_TIME_TYPE[client.work_time_type])}
        </Row>
        <Row label="始業 / 終業">
          {fmt(client.start_time)} ～ {fmt(client.end_time)}
        </Row>
        <Row label="休憩時間">
          {typeof client.break_minutes === "number"
            ? `${client.break_minutes}分`
            : "-"}
        </Row>
        <Row label="シフト備考">{fmt(client.shift_note)}</Row>
        <Row label="休日">{mapList(client.holidays, HOLIDAY_TYPE)}</Row>
        <Row label="休日曜日">
          {mapList(client.holiday_weekdays, WEEKDAY)}
        </Row>
        <Row label="年次有給休暇">{fmt(client.annual_leave)}</Row>
      </Section>

      <Section title="6. 賃金">
        <Row label="賃金形態">{fmt(WAGE_TYPE[client.wage_type])}</Row>
        <Row label="基本給">
          {typeof client.basic_wage === "number"
            ? `${client.basic_wage.toLocaleString()} 円`
            : "-"}
        </Row>
        <Row label="諸手当の有無">
          {fmt(YES_NO[client.has_allowances])}
        </Row>
        <Row label="諸手当の内訳">{allowances}</Row>
        <Row label="通勤手当">
          {typeof client.commute_allowance === "number"
            ? `${client.commute_allowance.toLocaleString()} 円`
            : "-"}
        </Row>
        <Row label="賃金締切日">
          {fmt(PAYMENT_CUTOFF[client.payment_cutoff_day])}
          {client.payment_cutoff_day === "other" && client.payment_cutoff_other
            ? ` / ${client.payment_cutoff_other}`
            : ""}
        </Row>
        <Row label="賃金支払日">{fmt(client.payment_date)}</Row>
        <Row label="支払方法">{fmt(PAYMENT_METHOD[client.payment_method])}</Row>
        <Row label="昇給">{fmt(client.salary_increase)}</Row>
        <Row label="賞与">{fmt(client.bonus)}</Row>
        <Row label="退職金">{fmt(client.retirement_allowance)}</Row>
      </Section>

      <Section title="7. その他">
        <Row label="社会保険">
          {mapList(client.social_insurance, SOCIAL_INSURANCE)}
        </Row>
        <Row label="退職に関する事項">{fmt(client.retirement_clause)}</Row>
        <Row label="定年">{fmt(client.retirement_age)}</Row>
        <Row label="特記事項">{fmt(client.remarks)}</Row>
      </Section>
    </div>
  );
}

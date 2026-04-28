"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { saveClientInputAction } from "@/app/(admin)/detail/[id]/actions";
import {
  clientFormSchema,
  deriveDefaultsFromTemplate,
  isContractStartInPast,
  RETIREMENT_AGE_PRESETS,
  RETIREMENT_CLAUSE_PRESETS,
  DEFAULT_RETIREMENT_AGE,
  DEFAULT_RETIREMENT_CLAUSE,
  type ClientFormValues,
} from "@/lib/validations/client-form";
import {
  ALLOWANCE_PATTERNS,
  ALLOWANCE_TYPE_LABELS,
  allowanceTypeValues,
  buildAllowanceDescription,
  emptyAllowanceItem,
  findPatternDef,
  normalizeAllowanceEntry,
  type AllowanceItem,
  type AllowanceType,
} from "@/lib/allowances";
import {
  calcMonthlyWorkHours,
  calcNetWorkMinutes,
  checkHourlyWage,
  checkMonthlyWage,
  estimateAnnualHolidays,
  extractPrefecture,
  type MinimumWageCheckResult,
} from "@/lib/validations/minimum-wage";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { BusyOverlay } from "@/components/ui/busy-overlay";

type RequestSummary = {
  id: string;
  access_token: string;
  company_name: string;
  company_address: string;
  representative_name: string;
  template_name: string;
};

const WEEKDAY_LABELS: Record<string, string> = {
  mon: "月",
  tue: "火",
  wed: "水",
  thu: "木",
  fri: "金",
  sat: "土",
  sun: "日",
  holiday: "祝日",
};

const SOCIAL_INSURANCE_LABELS: Record<string, string> = {
  health: "健康保険",
  pension: "厚生年金",
  employment: "雇用保険",
  rousai: "労災保険",
};

/** 必須マーク。2024年改正必須項目には theme=kaisei を付けて注記色に。 */
function Req({ kaisei = false }: { kaisei?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 align-baseline">
      <span
        className="text-base font-bold leading-none text-destructive"
        aria-hidden
      >
        *
      </span>
      <span className="sr-only">(必須)</span>
      {kaisei && (
        <span
          className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-700"
          title="2024年4月の労基法改正で明示が義務化された項目です"
        >
          2024改正
        </span>
      )}
    </span>
  );
}

// セクションメタデータ(色分け・進捗判定・次へ遷移で参照)
type SectionMeta = {
  id: string;
  title: string;
  is2024Amend: boolean;
};
const SECTIONS: readonly SectionMeta[] = [
  { id: "sec1", title: "1. 労働者氏名", is2024Amend: false },
  { id: "sec2", title: "2. 雇用区分・契約期間", is2024Amend: false },
  { id: "sec3", title: "3. 就業場所", is2024Amend: true },
  { id: "sec4", title: "4. 業務内容", is2024Amend: true },
  { id: "sec5", title: "5. 所定労働時間・休日", is2024Amend: false },
  { id: "sec6", title: "6. 賃金", is2024Amend: false },
  { id: "sec7", title: "7. 社会保険・退職・定年等", is2024Amend: false },
] as const;

/**
 * 各セクションの「常時必須」フィールド一覧。
 * 完了ドットの判定で使う(条件付き必須は zod superRefine で送信時に検証されるため、
 * ドット判定上は考慮しない・目安としての挙動)。
 */
const SECTION_REQUIRED_FIELDS: Record<string, string[]> = {
  sec1: ["last_name", "first_name"],
  sec2: [
    "employment_type",
    "has_contract_period",
    "contract_start_date",
    "has_probation",
  ],
  sec3: ["work_location_initial", "work_location_scope"],
  sec4: ["job_description_initial", "job_description_scope"],
  sec5: ["work_time_type", "holidays"],
  sec6: [
    "wage_type",
    "basic_wage",
    "has_fixed_overtime",
    "has_allowances",
    "payment_cutoff_day",
    "payment_date",
    "payment_method",
  ],
  // sec7 は必須項目なし。何か入力されていれば done、なければ empty で扱う。
  sec7: [],
};

/** sec7 の参考フィールド(empty/done 判定用)。 */
const SECTION7_OPTIONAL_FIELDS = [
  "social_insurance",
  "retirement_clause",
  "retirement_age",
  "remarks",
];

type SectionStatus = "done" | "partial" | "empty";

function SectionDot({ status }: { status: SectionStatus }) {
  if (status === "done") {
    return (
      <span
        className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
        aria-label="入力完了"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span
        className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500"
        aria-label="一部入力済み"
      />
    );
  }
  return (
    <span
      className="ml-2 inline-block h-2 w-2 rounded-full bg-muted-foreground/30"
      aria-hidden
    />
  );
}

/**
 * プリセット選択 + 「自由記述」で自由入力に切り替わる汎用フィールド。
 * 値はそのままプリセット文字列または自由記述の文字列として保存される(schema 変更不要)。
 */
function PresetOrOtherField({
  value,
  onChange,
  presets,
  placeholder = "-- 選択 --",
  otherLabel = "自由記述",
  otherPlaceholder,
}: {
  value: string;
  onChange: (v: string) => void;
  presets: readonly string[];
  placeholder?: string;
  otherLabel?: string;
  otherPlaceholder?: string;
}) {
  const isPreset = presets.includes(value);
  const [otherSticky, setOtherSticky] = useState<boolean>(
    !isPreset && value !== "",
  );
  const mode: "preset" | "other" =
    !isPreset && value !== "" ? "other" : otherSticky ? "other" : "preset";
  const selectValue =
    mode === "other" ? "__other__" : isPreset ? value : undefined;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__other__") {
            setOtherSticky(true);
            if (isPreset) onChange("");
          } else {
            setOtherSticky(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
          <SelectItem value="__other__">{otherLabel}</SelectItem>
        </SelectContent>
      </Select>
      {mode === "other" && (
        <Textarea
          rows={2}
          placeholder={otherPlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

const SALARY_INCREASE_PRESETS = [
  "有(年1回、勤務成績等を考慮して決定)",
  "有(昇給規程による)",
  "有(業績等により行わない場合あり)",
  "無",
] as const;

const BONUS_PRESETS = [
  "有(年2回、業績により支給)",
  "有(賞与規程による)",
  "有(5月、12月/業績により支給時期変更等あり)",
  "無",
] as const;

const RETIREMENT_ALLOWANCE_PRESETS = [
  "有(就業規則による)",
  "有(退職金規程による)",
  "無",
  "業績による",
] as const;

/**
 * 諸手当エディタ(折りたたみ式の1行カード)。
 *   - 種別(Select) → パターン(Select) → 必要項目 を動的表示
 *   - 折りたたみ時は手当名と description のサマリを表示
 */
function AllowanceEditorCard({
  idx,
  form,
  isOpen,
  onExpand,
  onCollapse,
  onRemove,
}: {
  idx: number;
  form: ReturnType<typeof useForm<ClientFormValues>>;
  isOpen: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onRemove: () => void;
}) {
  const item = form.watch(`allowances.${idx}`) as AllowanceItem | undefined;
  if (!item) return null;
  const patternDef = findPatternDef(item.allowance_type, item.allowance_pattern);
  const description = buildAllowanceDescription(item);
  const errors = (form.formState.errors.allowances as unknown as
    | Array<Record<string, { message?: string }> | undefined>
    | undefined)?.[idx];

  function updateType(newType: AllowanceType) {
    form.setValue(`allowances.${idx}.allowance_type`, newType, {
      shouldValidate: false,
    });
    // 名称が既存のラベルに一致していた場合のみ自動追従(ユーザー編集済みは尊重)
    const current = form.getValues(`allowances.${idx}.allowance_name`);
    const prevLabels = Object.values(ALLOWANCE_TYPE_LABELS);
    if (!current || prevLabels.includes(current)) {
      form.setValue(
        `allowances.${idx}.allowance_name`,
        ALLOWANCE_TYPE_LABELS[newType],
      );
    }
    form.setValue(`allowances.${idx}.allowance_pattern`, "");
    form.setValue(`allowances.${idx}.allowance_amount`, null);
    form.setValue(`allowances.${idx}.allowance_percentage`, null);
    form.setValue(`allowances.${idx}.allowance_upper_limit`, null);
    form.setValue(`allowances.${idx}.allowance_spouse_amount`, null);
    form.setValue(`allowances.${idx}.allowance_child_amount`, null);
    form.setValue(`allowances.${idx}.allowance_free_text`, null);
  }

  function updatePattern(newPattern: string) {
    form.setValue(`allowances.${idx}.allowance_pattern`, newPattern, {
      shouldValidate: false,
    });
    form.setValue(`allowances.${idx}.allowance_amount`, null);
    form.setValue(`allowances.${idx}.allowance_percentage`, null);
    form.setValue(`allowances.${idx}.allowance_upper_limit`, null);
    form.setValue(`allowances.${idx}.allowance_spouse_amount`, null);
    form.setValue(`allowances.${idx}.allowance_child_amount`, null);
    form.setValue(`allowances.${idx}.allowance_free_text`, null);
  }

  if (!isOpen) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate">
            <b>{item.allowance_name || ALLOWANCE_TYPE_LABELS[item.allowance_type]}</b>
            {" — "}
            <span className="text-muted-foreground">
              {description || "(支給パターン未設定)"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onExpand}>
            編集
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:bg-destructive/10"
          >
            削除
          </Button>
        </div>
      </div>
    );
  }

  const patternOptions = ALLOWANCE_PATTERNS[item.allowance_type] ?? [];

  return (
    <div className="space-y-3 rounded-md border bg-card p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">手当種別</Label>
          <Select
            value={item.allowance_type}
            onValueChange={(v) => updateType(v as AllowanceType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowanceTypeValues.map((t) => (
                <SelectItem key={t} value={t}>
                  {ALLOWANCE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">手当名(docx 表示)</Label>
          <Input
            value={item.allowance_name ?? ""}
            onChange={(e) =>
              form.setValue(
                `allowances.${idx}.allowance_name`,
                e.target.value,
              )
            }
            placeholder="例: 通勤手当"
          />
          {errors?.allowance_name?.message && (
            <p className="text-xs text-destructive">
              {errors.allowance_name.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">支給パターン</Label>
        <Select
          value={item.allowance_pattern || undefined}
          onValueChange={(v) => updatePattern(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="-- 支給パターンを選択 --" />
          </SelectTrigger>
          <SelectContent>
            {patternOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.allowance_pattern?.message && (
          <p className="text-xs text-destructive">
            {errors.allowance_pattern.message}
          </p>
        )}
      </div>

      {patternDef?.fields.includes("amount") && (
        <AmountField
          label="月額(円)"
          name={`allowances.${idx}.allowance_amount`}
          form={form}
          errorMessage={errors?.allowance_amount?.message}
        />
      )}
      {patternDef?.fields.includes("percentage") && (
        <AmountField
          label="割合(%)"
          name={`allowances.${idx}.allowance_percentage`}
          form={form}
          step="0.1"
          errorMessage={errors?.allowance_percentage?.message}
        />
      )}
      {patternDef?.fields.includes("upper_limit") && (
        <AmountField
          label="上限額(円)"
          name={`allowances.${idx}.allowance_upper_limit`}
          form={form}
          errorMessage={errors?.allowance_upper_limit?.message}
        />
      )}
      {patternDef?.fields.includes("spouse_amount") && (
        <AmountField
          label="配偶者分(円)"
          name={`allowances.${idx}.allowance_spouse_amount`}
          form={form}
          errorMessage={errors?.allowance_spouse_amount?.message}
        />
      )}
      {patternDef?.fields.includes("child_amount") && (
        <AmountField
          label="子1人あたり(円)"
          name={`allowances.${idx}.allowance_child_amount`}
          form={form}
          errorMessage={errors?.allowance_child_amount?.message}
        />
      )}
      {patternDef?.fields.includes("free_text") && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">支給条件</Label>
          <Textarea
            rows={2}
            placeholder={patternDef.freeTextPlaceholder}
            value={item.allowance_free_text ?? ""}
            onChange={(e) =>
              form.setValue(
                `allowances.${idx}.allowance_free_text`,
                e.target.value,
                { shouldValidate: false },
              )
            }
          />
          {errors?.allowance_free_text?.message && (
            <p className="text-xs text-destructive">
              {errors.allowance_free_text.message}
            </p>
          )}
        </div>
      )}

      {patternDef && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs">
          プレビュー: <b>{item.allowance_name || "(手当名)"}</b>{" — "}
          <span>{description || "(入力中)"}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCollapse}>
          閉じる
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          className="text-destructive hover:bg-destructive/10"
        >
          削除
        </Button>
      </div>
    </div>
  );
}

function AmountField({
  label,
  name,
  form,
  step,
  errorMessage,
}: {
  label: string;
  name: `allowances.${number}.${
    | "allowance_amount"
    | "allowance_percentage"
    | "allowance_upper_limit"
    | "allowance_spouse_amount"
    | "allowance_child_amount"}`;
  form: ReturnType<typeof useForm<ClientFormValues>>;
  step?: string;
  errorMessage?: string;
}) {
  const value = form.watch(name);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          form.setValue(
            name,
            raw === "" ? null : Number(raw),
            { shouldValidate: false },
          );
        }}
      />
      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
    </div>
  );
}

const PAYMENT_DATE_PRESETS = [
  "当月10日",
  "当月15日",
  "当月20日",
  "当月25日",
  "当月末日",
  "翌月10日",
  "翌月15日",
  "翌月20日",
  "翌月25日",
  "翌月末日",
] as const;

/**
 * 賃金支払日を Select(プリセット) + その他(自由記述)で入力するフィールド。
 * 値は string として保存される(schema 変更不要)。
 */
function PaymentDateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isPreset = (PAYMENT_DATE_PRESETS as readonly string[]).includes(value);
  const [otherSticky, setOtherSticky] = useState<boolean>(
    !isPreset && value !== "",
  );
  const mode: "preset" | "other" =
    !isPreset && value !== "" ? "other" : otherSticky ? "other" : "preset";
  const selectValue =
    mode === "other" ? "__other__" : isPreset ? value : undefined;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__other__") {
            setOtherSticky(true);
            if (isPreset) onChange("");
          } else {
            setOtherSticky(false);
            onChange(v);
          }
        }}
      >
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="-- 選択 --" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {PAYMENT_DATE_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
          <SelectItem value="__other__">その他(自由記述)</SelectItem>
        </SelectContent>
      </Select>
      {mode === "other" && (
        <Input
          placeholder="例: 翌月5日、毎月第4金曜日"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * 最低賃金チェックの状態を basic_wage フィールド直下に表示するミニパネル。
 * 判定結果が見える化されていないと UI 上「動いていないように」見えるため追加。
 */
function MinWageStatus({
  prefecture,
  minimumWage,
  result,
  wageType,
  workTimeType,
}: {
  prefecture: string | null;
  minimumWage: number | null;
  result: MinimumWageCheckResult | null;
  wageType: string | undefined;
  workTimeType: string | undefined;
}) {
  const prefLabel = prefecture ?? "(会社所在地から判定不可)";
  const minLabel =
    minimumWage !== null ? `${minimumWage}円/h` : "(マスタ未登録 / 取得中)";

  let verdict: React.ReactNode = "—";
  let tone = "text-muted-foreground";

  if (!result) {
    verdict = "基本給が入力されるとチェックします";
  } else if (result.ok === false) {
    const hourly = Math.floor(result.hourlyEquiv);
    verdict = (
      <span className="text-destructive font-medium">
        NG: 時給換算 {hourly}円 が最低賃金 {result.threshold}円 を下回ります
      </span>
    );
    tone = "";
  } else if ("skipped" in result && result.skipped) {
    const reasonLabel: Record<string, string> = {
      no_prefecture: "会社所在地から都道府県を判定できませんでした",
      no_minimum_wage_for_prefecture:
        "当該都道府県の最低賃金マスタが未登録のためスキップ",
      shift_monthly_indeterminate:
        "シフト制または日給は事務所側で再チェックします",
      missing_inputs: "労働時間・休日が未入力のためスキップ",
    };
    // missing_inputs は顧客自身で解消できる(働時間・休日を入力)ので注意喚起色
    const isActionable = result.reason === "missing_inputs";
    verdict = (
      <span
        className={
          isActionable ? "text-amber-700 font-medium" : "text-muted-foreground"
        }
      >
        スキップ: {reasonLabel[result.reason] ?? result.reason}
      </span>
    );
    if (isActionable) tone = "";
  } else if (result.ok === true && !("skipped" in result)) {
    const hourly = Math.floor(result.hourlyEquiv);
    verdict = (
      <span className="text-emerald-700 font-medium">
        OK: 時給換算 {hourly}円 ≧ 最低賃金 {result.threshold}円
      </span>
    );
    tone = "";
  }

  return (
    <div className={`mt-1 rounded-md border bg-muted/40 p-2 text-xs ${tone}`}>
      <div>
        都道府県: <b>{prefLabel}</b> / 最低賃金: <b>{minLabel}</b>
      </div>
      <div>
        賃金形態: {wageType ?? "-"} / 労働時間区分: {workTimeType ?? "-"}
      </div>
      <div className="pt-1">判定: {verdict}</div>
    </div>
  );
}

type CustomerFormMode = "customer" | "admin-edit";

export function CustomerForm({
  request,
  mode = "customer",
  initialValues = null,
  onSaved,
}: {
  request: RequestSummary;
  mode?: CustomerFormMode;
  initialValues?: ClientFormValues | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isAdminEdit = mode === "admin-edit";
  const derived = useMemo(
    () => deriveDefaultsFromTemplate(request.template_name),
    [request.template_name],
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorRetryable, setSubmitErrorRetryable] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [expandedAllowanceIdx, setExpandedAllowanceIdx] = useState<number>(-1);

  // 既存データ(旧 {name, amount} 形式含む)を新構造に揃えてから defaultValues に渡す
  const normalizedInitial = useMemo(() => {
    if (!initialValues) return null;
    const raw = initialValues as unknown as ClientFormValues & {
      allowances?: unknown[];
      has_fixed_overtime?: string;
    };
    return {
      ...raw,
      allowances: Array.isArray(raw.allowances)
        ? raw.allowances.map(normalizeAllowanceEntry)
        : [],
      // レガシーデータ(has_fixed_overtime 未保存)は admin-edit で再保存できるよう "no" を初期値に。
      // 顧客が実際は「あり」だった場合は事務所が確認のうえ "yes" に切り替える運用。
      has_fixed_overtime:
        raw.has_fixed_overtime === "yes" || raw.has_fixed_overtime === "no"
          ? raw.has_fixed_overtime
          : "no",
    } as ClientFormValues;
  }, [initialValues]);

  const form = useForm<ClientFormValues>({
    // @hookform/resolvers@5 × zod@4 の型推論差異を回避するためのキャスト。
    // ランタイム動作は問題なく、フィールド名の型安全性は useForm<ClientFormValues> で担保される。
    resolver: zodResolver(clientFormSchema) as unknown as Resolver<ClientFormValues>,
    mode: "onBlur",
    defaultValues: normalizedInitial ?? {
      last_name: "",
      first_name: "",
      employment_type: derived.employment_type,
      has_contract_period: derived.has_contract_period ?? "no",
      contract_start_date: "",
      contract_end_date: "",
      renewal_type: undefined,
      renewal_limit_exists: undefined,
      renewal_limit_content: "",
      has_probation: "no",
      probation_period: "",
      work_location_initial: "",
      work_location_scope: "",
      job_description_initial: "",
      job_description_scope: "",
      work_time_type: "fixed",
      start_time: "09:00",
      end_time: "18:00",
      break_minutes: "",
      shift_note: "",
      holidays: [],
      holiday_weekdays: [],
      annual_leave: "",
      wage_type: "monthly",
      basic_wage: 0,
      has_fixed_overtime: "no",
      has_allowances: "no",
      allowances: [],
      commute_allowance: "",
      payment_cutoff_day: "end",
      payment_cutoff_other: "",
      payment_date: "",
      payment_method: "bank_transfer",
      salary_increase: "",
      bonus: "無",
      retirement_allowance: "無",
      social_insurance: ["rousai"],
      retirement_clause: DEFAULT_RETIREMENT_CLAUSE,
      retirement_age: DEFAULT_RETIREMENT_AGE,
      remarks: "",
    },
  });

  const allowances = useFieldArray({
    control: form.control,
    name: "allowances",
  });

  const lastName = form.watch("last_name");
  const firstName = form.watch("first_name");
  const employmentType = form.watch("employment_type");
  const hasContractPeriod = form.watch("has_contract_period");
  const renewalLimitExists = form.watch("renewal_limit_exists");
  const hasProbation = form.watch("has_probation");
  const hasFixedOvertime = form.watch("has_fixed_overtime");
  const workTimeType = form.watch("work_time_type");
  const hasAllowances = form.watch("has_allowances");
  const paymentCutoff = form.watch("payment_cutoff_day");
  const holidays = form.watch("holidays");

  // セクション完了状態の判定(進捗バー & アコーディオンタイトルのドットで使用)。
  // 注意: 条件付き必須(zod superRefine 由来)は完璧には拾えない目安判定。
  const watchedAll = form.watch();
  const sectionStatuses: Record<string, SectionStatus> = {};
  for (const sec of SECTIONS) {
    const required = SECTION_REQUIRED_FIELDS[sec.id] ?? [];
    const fieldsToCheck =
      required.length > 0 ? required : SECTION7_OPTIONAL_FIELDS;
    const isFilled = (name: string) => {
      const v = (watchedAll as Record<string, unknown>)[name];
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "number") return v > 0;
      if (typeof v === "string") return v.trim().length > 0;
      return v !== undefined && v !== null && v !== "";
    };
    const filledCount = fieldsToCheck.filter(isFilled).length;
    const hasError = fieldsToCheck.some(
      (f) =>
        (form.formState.errors as Record<string, unknown>)[f] !== undefined,
    );
    if (required.length === 0) {
      // sec7: 任意項目のみ。1つでも入っていれば done、何もなければ empty。
      sectionStatuses[sec.id] = filledCount > 0 ? "done" : "empty";
    } else if (filledCount === 0) {
      sectionStatuses[sec.id] = "empty";
    } else if (filledCount === required.length && !hasError) {
      sectionStatuses[sec.id] = "done";
    } else {
      sectionStatuses[sec.id] = "partial";
    }
  }
  const doneCount = Object.values(sectionStatuses).filter(
    (s) => s === "done",
  ).length;

  // 「次のセクションへ」: アコーディオン末尾のボタンから呼ぶ。
  const goToNextSection = (currentId: string) => {
    const idx = SECTIONS.findIndex((s) => s.id === currentId);
    if (idx < 0 || idx >= SECTIONS.length - 1) return;
    const next = SECTIONS[idx + 1].id;
    const sec = document.getElementById(next);
    const trigger = sec?.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    );
    if (trigger && trigger.getAttribute("aria-expanded") !== "true") {
      trigger.click();
    }
    setTimeout(() => {
      sec?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  };

  // Sheet04 の表示制御
  const isFullTime = employmentType === "seishain";
  const showContractPeriodSelector = !isFullTime; // 正社員は「なし固定」なので選択UIを隠す
  const showFixedTermFields =
    !isFullTime && hasContractPeriod === "yes"; // 有期関連(No.12-15)

  // ----------------------------------------------------------------
  // No.3 警告: 契約開始日が入力時点より過去
  // ----------------------------------------------------------------
  const contractStartDate = form.watch("contract_start_date");
  const pastStartWarning = isContractStartInPast(contractStartDate);

  // ----------------------------------------------------------------
  // No.6 / No.7 最低賃金チェック(非同期)
  //   会社所在地の都道府県 → /api/minimum-wage で時給を取得 → チェック
  // ----------------------------------------------------------------
  const prefecture = useMemo(
    () => extractPrefecture(request.company_address),
    [request.company_address],
  );

  const [minimumWage, setMinimumWage] = useState<number | null>(null);
  const [minWageFetchError, setMinWageFetchError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!prefecture) return;
    let cancelled = false;
    fetch(`/api/minimum-wage?prefecture=${encodeURIComponent(prefecture)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setMinimumWage(null);
          setMinWageFetchError("該当都道府県の最低賃金マスタが未登録です");
          return;
        }
        if (!r.ok) {
          setMinWageFetchError("最低賃金の取得に失敗しました");
          return;
        }
        const data = (await r.json()) as { hourly_wage: number };
        setMinimumWage(data.hourly_wage);
        setMinWageFetchError(null);
      })
      .catch(() => {
        if (!cancelled) setMinWageFetchError("最低賃金の取得に失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [prefecture]);

  const basicWage = form.watch("basic_wage");
  const wageType = form.watch("wage_type");
  const startTime = form.watch("start_time");
  const endTime = form.watch("end_time");
  const breakMinutes = form.watch("break_minutes");
  const holidayWeekdays = form.watch("holiday_weekdays");

  const [minWageResult, setMinWageResult] =
    useState<MinimumWageCheckResult | null>(null);

  useEffect(() => {
    const wage = typeof basicWage === "number" ? basicWage : Number(basicWage);
    if (!Number.isFinite(wage) || wage <= 0) {
      setMinWageResult(null);
      return;
    }

    if (wageType === "hourly") {
      setMinWageResult(
        checkHourlyWage({
          prefecture,
          minimumWage,
          hourlyWage: wage,
        }),
      );
      return;
    }

    if (wageType === "monthly" || wageType === "daily_monthly") {
      if (workTimeType !== "fixed") {
        setMinWageResult({
          ok: true,
          skipped: true,
          reason: "shift_monthly_indeterminate",
        });
        return;
      }
      const br =
        typeof breakMinutes === "number"
          ? breakMinutes
          : Number(breakMinutes) || null;
      const annualHolidays = estimateAnnualHolidays(holidays, holidayWeekdays);
      const monthlyHours = calcMonthlyWorkHours({
        startTime,
        endTime,
        breakMinutes: br,
        annualHolidays,
      });
      if (monthlyHours === null) {
        setMinWageResult({
          ok: true,
          skipped: true,
          reason: "missing_inputs",
        });
        return;
      }
      setMinWageResult(
        checkMonthlyWage({
          prefecture,
          minimumWage,
          basicWage: wage,
          monthlyHours,
        }),
      );
      return;
    }

    // 日給は顧客側で月所定時間を組むのが困難なため、事務所側で再チェックする方針。
    setMinWageResult({
      ok: true,
      skipped: true,
      reason: "shift_monthly_indeterminate",
    });
  }, [
    basicWage,
    wageType,
    workTimeType,
    startTime,
    endTime,
    breakMinutes,
    holidays,
    holidayWeekdays,
    prefecture,
    minimumWage,
  ]);

  const hasMinWageError = minWageResult?.ok === false;

  // ----------------------------------------------------------------
  // 週所定労働時間の推定(社会保険加入推奨の注意喚起用・自動選択はしない)
  //   - 固定時間制 + 曜日指定休日の組み合わせのみ算出可能
  //   - 週20h以上 → 雇用保険 / 週30h以上 → 健康保険・厚生年金・雇用保険 が推奨。
  // ----------------------------------------------------------------
  const weeklyScheduledHours = useMemo(() => {
    if (workTimeType !== "fixed") return null;
    const br =
      typeof breakMinutes === "number"
        ? breakMinutes
        : Number(breakMinutes) || null;
    const net = calcNetWorkMinutes(startTime, endTime, br);
    if (net === null) return null;
    const dailyHours = net / 60;
    // 「祝日」は年16日程度・週ベースに換算しないため、所定労働日数計算から除外。
    const weekdayHolidayCount = holidays?.includes("weekday")
      ? holidayWeekdays?.filter((w) => w !== "holiday").length ?? 0
      : 0;
    const workingDaysPerWeek = Math.max(7 - weekdayHolidayCount, 0);
    if (workingDaysPerWeek === 0) return null;
    return dailyHours * workingDaysPerWeek;
  }, [workTimeType, startTime, endTime, breakMinutes, holidays, holidayWeekdays]);

  // basic_wage の FormMessage と同じ枠でエラー表示させる
  const lastMinWageErrorRef = useRef<boolean>(false);
  useEffect(() => {
    if (hasMinWageError && !("skipped" in (minWageResult ?? {}))) {
      const r = minWageResult as Extract<
        MinimumWageCheckResult,
        { ok: false }
      >;
      form.setError("basic_wage", {
        type: "min_wage",
        message: `時給換算 ${Math.floor(r.hourlyEquiv)}円 が${r.prefecture}の最低賃金 ${r.threshold}円 を下回っています`,
      });
      lastMinWageErrorRef.current = true;
    } else if (lastMinWageErrorRef.current) {
      // 直前に最賃エラーを出していた場合のみクリア(他の zod エラーを潰さない)
      const current = form.formState.errors.basic_wage;
      if (current?.type === "min_wage") form.clearErrors("basic_wage");
      lastMinWageErrorRef.current = false;
    }
  }, [hasMinWageError, minWageResult, form]);

  // ----------------------------------------------------------------
  // エラーサマリ用
  // ----------------------------------------------------------------
  const FIELD_LABELS: Record<string, string> = {
    last_name: "姓",
    first_name: "名",
    employment_type: "雇用形態",
    has_contract_period: "契約期間の定め",
    contract_start_date: "契約開始日",
    contract_end_date: "契約終了日",
    renewal_limit_exists: "更新上限の定め",
    renewal_limit_content: "更新上限の内容",
    probation_period: "試用期間",
    work_location_initial: "雇入れ直後の就業場所",
    work_location_scope: "就業場所の変更の範囲",
    job_description_initial: "雇入れ直後の業務内容",
    job_description_scope: "業務の変更の範囲",
    start_time: "始業時刻",
    end_time: "終業時刻",
    break_minutes: "休憩時間",
    holidays: "休日",
    holiday_weekdays: "休日指定曜日",
    basic_wage: "基本給",
    has_fixed_overtime: "固定残業代の有無",
    payment_cutoff_day: "賃金締切日",
    payment_cutoff_other: "賃金締切日(その他)",
    payment_date: "賃金支払日",
    social_insurance: "社会保険",
  };

  const onSubmit = async (values: ClientFormValues) => {
    setSubmitError(null);
    setSubmitErrorRetryable(false);
    setSaveSuccess(false);
    setSubmitting(true);

    if (isAdminEdit) {
      try {
        const result = await saveClientInputAction({
          id: request.id,
          values,
        });
        if (result.ok) {
          setSaveSuccess(true);
          onSaved?.();
          return;
        }
        if (result.fieldErrors) {
          for (const [name, message] of Object.entries(result.fieldErrors)) {
            form.setError(name as keyof ClientFormValues, {
              type: "server",
              message,
            });
          }
          setSubmitError(result.error);
          setSubmitErrorRetryable(false);
        } else {
          setSubmitError(result.error);
          setSubmitErrorRetryable(true);
        }
      } catch {
        setSubmitError("保存中にエラーが発生しました。再度お試しください。");
        setSubmitErrorRetryable(true);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: request.access_token,
          formData: values,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { redirectTo?: string };
        router.replace(data.redirectTo ?? "/complete");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      const messages: Record<string, string> = {
        token_not_found: "URLが無効です。事務所にご連絡ください。",
        token_expired:
          "有効期限が切れています。事務所に新しいURLをご依頼ください。",
        already_submitted:
          "このURLからの送信はすでに完了しています。修正はできません。",
        validation_failed:
          "入力内容にエラーがあります。ページを更新してから再度お試しください。",
        invalid_body: "送信データが不正です。ページを更新してください。",
        internal_error:
          "サーバーでエラーが発生しました。時間をおいて再度お試しください。",
      };
      const retryableCodes = new Set(["internal_error"]);
      setSubmitError(
        messages[body.error ?? ""] ??
          "送信に失敗しました。時間をおいて再度お試しください。",
      );
      setSubmitErrorRetryable(
        !body.error || retryableCodes.has(body.error),
      );
    } catch {
      setSubmitError(
        "通信エラーが発生しました。ネットワーク接続をご確認のうえ再度お試しください。",
      );
      setSubmitErrorRetryable(true);
    } finally {
      setSubmitting(false);
    }
  };

  // フィールド名 → アコーディオン section ID の対応表。
  // エラーサマリのジャンプ機能と最低賃金バナーの「基本給を確認」ボタンで使う。
  const FIELD_SECTION: Record<string, string> = {
    last_name: "sec1",
    first_name: "sec1",
    employment_type: "sec2",
    has_contract_period: "sec2",
    contract_start_date: "sec2",
    contract_end_date: "sec2",
    renewal_type: "sec2",
    renewal_limit_exists: "sec2",
    renewal_limit_content: "sec2",
    has_probation: "sec2",
    probation_period: "sec2",
    work_location_initial: "sec3",
    work_location_scope: "sec3",
    job_description_initial: "sec4",
    job_description_scope: "sec4",
    work_time_type: "sec5",
    start_time: "sec5",
    end_time: "sec5",
    break_minutes: "sec5",
    shift_note: "sec5",
    holidays: "sec5",
    holiday_weekdays: "sec5",
    annual_leave: "sec5",
    wage_type: "sec6",
    basic_wage: "sec6",
    has_fixed_overtime: "sec6",
    has_allowances: "sec6",
    allowances: "sec6",
    commute_allowance: "sec6",
    payment_cutoff_day: "sec6",
    payment_cutoff_other: "sec6",
    payment_date: "sec6",
    payment_method: "sec6",
    salary_increase: "sec6",
    bonus: "sec6",
    retirement_allowance: "sec6",
    social_insurance: "sec7",
    retirement_clause: "sec7",
    retirement_age: "sec7",
    remarks: "sec7",
  };

  // 指定フィールドに移動する。アコーディオンが閉じていれば開いてから
  // スクロール+フォーカス。配列フィールド(allowances 等)は input が
  // 個別 name で管理されるためフォールバックとして section 先頭にスクロール。
  const jumpToField = (fieldName: string) => {
    const sectionId = FIELD_SECTION[fieldName.split(".")[0] ?? fieldName];
    if (sectionId) {
      const sec = document.getElementById(sectionId);
      const trigger = sec?.querySelector<HTMLButtonElement>(
        "button[aria-expanded]",
      );
      if (trigger && trigger.getAttribute("aria-expanded") !== "true") {
        trigger.click();
      }
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(
          `[name="${fieldName}"]`,
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        } else {
          sec?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 200);
    }
  };

  const onInvalid = (errors: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.warn("[C-01 バリデーションエラー]", errors);
    const firstKey = Object.keys(errors)[0];
    if (firstKey) jumpToField(firstKey);
  };

  const Wrapper: React.ElementType = isAdminEdit ? "div" : "main";

  // 最低賃金 NG 時の常時表示用テキスト(スクロール追従バナーで使う)。
  const minWageNgInfo =
    hasMinWageError && minWageResult && "hourlyEquiv" in minWageResult
      ? {
          hourly: Math.floor(minWageResult.hourlyEquiv),
          threshold: minWageResult.threshold,
          prefecture: minWageResult.prefecture,
        }
      : null;

  return (
    <Wrapper className={isAdminEdit ? "" : "mx-auto max-w-3xl p-4 md:p-8"}>
      {/* sticky 領域: 最低賃金 NG バナー(優先) + 進捗バーをスタックで上部固定。
          単一の sticky コンテナにまとめることで、両方表示時に重ならず縦に並ぶ。 */}
      {!isAdminEdit && (
        <div className="sticky top-0 z-20 -mx-4 mb-4 md:-mx-8">
          {minWageNgInfo && (
            <div
              role="alert"
              className="border-b-2 border-destructive bg-destructive/15 px-4 py-2 backdrop-blur md:px-8"
            >
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="min-w-0 flex-1 text-xs leading-relaxed text-destructive">
                  <p className="font-semibold">
                    最低賃金違反: 時給換算 {minWageNgInfo.hourly}円 が{minWageNgInfo.prefecture}の最低賃金 {minWageNgInfo.threshold}円 を下回ります
                  </p>
                  <p className="mt-0.5">
                    基本給を再確認してください。このままでは送信できません。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => jumpToField("basic_wage")}
                  className="shrink-0 rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  基本給を確認
                </button>
              </div>
            </div>
          )}
          {/* 進捗バー: 7セクションを横一列の小さなブロックで可視化。 */}
          <div className="border-b bg-background/95 px-4 py-2 backdrop-blur md:px-8">
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-xs text-muted-foreground">
                入力進捗 {doneCount}/{SECTIONS.length}
              </span>
              <div className="flex flex-1 gap-1">
                {SECTIONS.map((s) => {
                  const st = sectionStatuses[s.id];
                  const cls =
                    st === "done"
                      ? "bg-emerald-500"
                      : st === "partial"
                        ? "bg-amber-400"
                        : "bg-muted-foreground/20";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const sec = document.getElementById(s.id);
                        const trigger = sec?.querySelector<HTMLButtonElement>(
                          "button[aria-expanded]",
                        );
                        if (
                          trigger &&
                          trigger.getAttribute("aria-expanded") !== "true"
                        ) {
                          trigger.click();
                        }
                        setTimeout(() => {
                          sec?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }, 200);
                      }}
                      className={`h-1.5 flex-1 rounded transition-colors ${cls}`}
                      aria-label={`${s.title} (${st === "done" ? "完了" : st === "partial" ? "一部" : "未入力"})`}
                      title={s.title}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 会社情報ヘッダー(顧客モードのみ) */}
      {!isAdminEdit && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl leading-snug">
              {request.company_name} 様 労働条件通知書 ご入力フォーム
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <div>会社所在地: {request.company_address}</div>
            <div>代表者: {request.representative_name}</div>
            <p className="pt-2 text-xs">
              各セクションをタップで開閉できます。入力内容は事務所で確認のうえ、労働条件通知書として書面化されます。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 事務所編集モード: 保存成功バナー */}
      {isAdminEdit && saveSuccess && (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          顧客入力を更新しました。
        </div>
      )}

      {/* バリデーションエラーサマリ(エラーがある間は常時表示) */}
      {Object.keys(form.formState.errors).length > 0 && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <p className="font-semibold">
              入力内容に不備があります。下記をご確認ください。
            </p>
            <ul className="mt-2 space-y-1 pl-1">
              {Object.entries(form.formState.errors).map(([key, err]) => {
                const label = FIELD_LABELS[key] ?? key;
                const message =
                  err && typeof err === "object" && "message" in err
                    ? String((err as { message?: unknown }).message ?? "")
                    : "";
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => jumpToField(key)}
                      className="text-left text-destructive underline-offset-2 hover:underline"
                    >
                      ・{label}
                      {message ? `: ${message}` : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      {/* 送信API エラーバナー */}
      {submitError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p>{submitError}</p>
          {submitErrorRetryable && (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() =>
                  form.handleSubmit(onSubmit, onInvalid)()
                }
              >
                {submitting ? "送信中..." : "もう一度送信する"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* No.3 警告: 契約開始日が過去(送信ブロックしない) */}
      {pastStartWarning && (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          契約開始日が本日より前の日付になっています。中途入社などで過去日付にする場合はそのままで問題ありません。
        </div>
      )}

      {/* 最賃マスタ未登録などの通知(任意) */}
      {minWageFetchError && (
        <div
          role="status"
          className="mb-4 rounded-md border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700"
        >
          {minWageFetchError}。最低賃金チェックは事務所側で実施します。
        </div>
      )}

      <Form {...form}>
        <div className="relative">
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          aria-busy={submitting}
          onKeyDown={(e) => {
            // Enter での誤送信を防ぎ、次のフォーカス可能要素へ移動する。
            // textarea 内の改行、IME 変換確定、送信ボタン自体の Enter は
            // 既定動作を維持する。
            if (e.key !== "Enter") return;
            if (e.nativeEvent.isComposing) return;
            const target = e.target as HTMLElement;
            const tag = target.tagName;
            if (tag === "TEXTAREA") return;
            if (
              tag === "BUTTON" &&
              (target as HTMLButtonElement).type === "submit"
            ) {
              return;
            }
            e.preventDefault();
            const focusables = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])',
              ),
            ).filter(
              (el) =>
                !el.hasAttribute("aria-hidden") && el.offsetParent !== null,
            );
            const idx = focusables.indexOf(target);
            if (idx >= 0 && idx < focusables.length - 1) {
              focusables[idx + 1].focus();
            }
          }}
          className="space-y-4"
          noValidate
        >
          <Accordion
            type="multiple"
            defaultValue={["sec1"]}
            className="rounded-lg border bg-card"
          >
            {/* ========== 1. 労働者基本情報 ========== */}
            <AccordionItem
              value="sec1"
              id="sec1"
              className="border-l-4 border-l-sky-400"
            >
              <AccordionTrigger className="px-4 text-base">
                <span className="flex items-center">
                  1. 労働者氏名
                  <SectionDot status={sectionStatuses.sec1} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          姓<Req />
                        </FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="family-name"
                            placeholder="例: 山田"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          名<Req />
                        </FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="given-name"
                            placeholder="例: 太郎"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {(lastName?.trim() || firstName?.trim()) && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <span className="text-xs text-muted-foreground">
                      通知書の表記プレビュー:
                    </span>{" "}
                    <b>
                      {lastName?.trim() ?? ""}　{firstName?.trim() ?? ""}
                    </b>
                    {" 殿"}
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      姓と名の区切りが上記のように意図通りか、ご確認ください。
                    </p>
                  </div>
                )}
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToNextSection("sec1")}
                  >
                    次のセクションへ →
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ========== 2. 雇用区分・契約期間 ========== */}
            <AccordionItem
              value="sec2"
              id="sec2"
              className="border-l-4 border-l-sky-400"
            >
              <AccordionTrigger className="px-4 text-base">
                <span className="flex items-center">
                  2. 雇用区分・契約期間
                  <SectionDot status={sectionStatuses.sec2} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FormField
                  control={form.control}
                  name="employment_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        雇用形態<Req />
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="選択してください" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="seishain">正社員</SelectItem>
                          <SelectItem value="keiyaku">契約社員</SelectItem>
                          <SelectItem value="part">
                            パート・アルバイト
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        選択により以下の表示項目が変わります。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showContractPeriodSelector && (
                  <FormField
                    control={form.control}
                    name="has_contract_period"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          契約期間の定め<Req />
                        </FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex gap-4 pt-1"
                          >
                            <Label className="flex items-center gap-2 font-normal">
                              <RadioGroupItem value="no" /> なし
                            </Label>
                            <Label className="flex items-center gap-2 font-normal">
                              <RadioGroupItem value="yes" /> あり
                            </Label>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="contract_start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        契約開始日(入社日)<Req />
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showFixedTermFields && (
                  <>
                    <FormField
                      control={form.control}
                      name="contract_end_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            契約終了日<Req />
                          </FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="renewal_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            更新の有無<Req kaisei />
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="選択してください" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="auto">自動更新</SelectItem>
                              <SelectItem value="maybe">
                                更新する場合あり
                              </SelectItem>
                              <SelectItem value="no">更新しない</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="renewal_limit_exists"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            更新上限の定め<Req kaisei />
                          </FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="flex gap-4 pt-1"
                            >
                              <Label className="flex items-center gap-2 font-normal">
                                <RadioGroupItem value="no" /> なし
                              </Label>
                              <Label className="flex items-center gap-2 font-normal">
                                <RadioGroupItem value="yes" /> あり
                              </Label>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {renewalLimitExists === "yes" && (
                      <FormField
                        control={form.control}
                        name="renewal_limit_content"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              更新上限の内容<Req kaisei />
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="例:通算5年まで / 更新3回まで"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}

                <FormField
                  control={form.control}
                  name="has_probation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        試用期間の有無<Req />
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4 pt-1"
                        >
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="no" /> なし
                          </Label>
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="yes" /> あり
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasProbation === "yes" && (
                  <>
                    <div
                      role="status"
                      className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900"
                    >
                      <p className="font-medium">事務所側で確認・追記する項目</p>
                      <p className="mt-1 text-xs">
                        試用期間中の労働条件差異(賃金・社会保険・勤務条件等)は、
                        ご依頼元の事務所側で確認のうえ追記しますので、入力は不要です。
                        期間のみご記入ください。
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="probation_period"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            試用期間<Req />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="例:3ヶ月" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToNextSection("sec2")}
                  >
                    次のセクションへ →
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ========== 3. 就業場所(2024改正項目を含む) ========== */}
            <AccordionItem
              value="sec3"
              id="sec3"
              className="border-l-4 border-l-indigo-500"
            >
              <AccordionTrigger className="px-4 text-base">
                <span className="flex items-center">
                  3. 就業場所
                  <SectionDot status={sectionStatuses.sec3} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FormField
                  control={form.control}
                  name="work_location_initial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        雇入れ直後の就業場所<Req />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="例:本社、○○支店"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="work_location_scope"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        就業場所の変更の範囲<Req kaisei />
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例:会社が定める事業所 / 本社及び各支店 / 変更なし"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        将来的に異動・転勤があり得る範囲をご記入ください。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToNextSection("sec3")}
                  >
                    次のセクションへ →
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ========== 4. 業務内容 ========== */}
            <AccordionItem
              value="sec4"
              id="sec4"
              className="border-l-4 border-l-indigo-500"
            >
              <AccordionTrigger className="px-4 text-base">
                <span className="flex items-center">
                  4. 業務内容
                  <SectionDot status={sectionStatuses.sec4} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FormField
                  control={form.control}
                  name="job_description_initial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        雇入れ直後の業務内容<Req />
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例:営業事務、経理補助、製造ライン作業"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="job_description_scope"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        業務の変更の範囲<Req kaisei />
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例:会社が定める業務 / 変更なし"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToNextSection("sec4")}
                  >
                    次のセクションへ →
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ========== 5. 所定労働時間・休日 ========== */}
            <AccordionItem
              value="sec5"
              id="sec5"
              className="border-l-4 border-l-sky-400"
            >
              <AccordionTrigger className="px-4 text-base">
                <span className="flex items-center">
                  5. 所定労働時間・休日
                  <SectionDot status={sectionStatuses.sec5} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FormField
                  control={form.control}
                  name="work_time_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        勤務時間形態<Req />
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4 pt-1"
                        >
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="fixed" /> 固定時間
                          </Label>
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="shift" /> シフト制
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {workTimeType === "fixed" && (
                  <>
                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="start_time"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              始業時刻<Req />
                            </FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="end_time"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              終業時刻<Req />
                            </FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="break_minutes"
                        render={({ field }) => {
                          const presets = ["15", "30", "45", "60"] as const;
                          const currentStr =
                            field.value === "" || field.value === undefined
                              ? ""
                              : String(field.value);
                          const selectValue =
                            currentStr !== "" &&
                            (presets as readonly string[]).includes(currentStr)
                              ? currentStr
                              : currentStr !== ""
                                ? "other"
                                : "";
                          return (
                            <FormItem>
                              <FormLabel>
                                休憩時間<Req />
                              </FormLabel>
                              <FormControl>
                                <Select
                                  value={selectValue}
                                  onValueChange={(v) => {
                                    if (v === "other") {
                                      // その他選択時は空文字にして下段の数値入力に促す
                                      field.onChange("");
                                    } else {
                                      field.onChange(Number(v));
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="選択してください" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="15">15分</SelectItem>
                                    <SelectItem value="30">30分</SelectItem>
                                    <SelectItem value="45">45分</SelectItem>
                                    <SelectItem value="60">1時間(60分)</SelectItem>
                                    <SelectItem value="other">その他(分数を入力)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              {selectValue === "other" && (
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  placeholder="例: 75"
                                  value={currentStr}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    field.onChange(
                                      raw === "" ? "" : Number(raw),
                                    );
                                  }}
                                />
                              )}
                              <FormDescription>
                                労働時間6h超→45分以上、8h超→60分以上
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    </div>
                  </>
                )}

                {workTimeType === "shift" && (
                  <FormField
                    control={form.control}
                    name="shift_note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>シフト制の補足</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="例:1日8h・週40h以内。勤務日はシフト表で通知。"
                            rows={2}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="holidays"
                  render={() => (
                    <FormItem>
                      <FormLabel>
                        休日<Req />
                      </FormLabel>
                      <div className="flex flex-wrap gap-4 pt-1">
                        {(
                          [
                            ["weekday", "曜日指定"],
                            ["shift", "シフト"],
                            ["other", "その他"],
                          ] as const
                        ).map(([value, label]) => (
                          <FormField
                            key={value}
                            control={form.control}
                            name="holidays"
                            render={({ field }) => {
                              const checked = field.value?.includes(value);
                              return (
                                <Label className="flex items-center gap-2 font-normal">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(c) => {
                                      const next = new Set(field.value ?? []);
                                      if (c) next.add(value);
                                      else next.delete(value);
                                      field.onChange(Array.from(next));
                                    }}
                                  />
                                  {label}
                                </Label>
                              );
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {holidays?.includes("weekday") && (
                  <FormField
                    control={form.control}
                    name="holiday_weekdays"
                    render={() => (
                      <FormItem>
                        <FormLabel>
                          休日指定曜日<Req />
                        </FormLabel>
                        <div className="flex flex-wrap gap-3 pt-1">
                          {Object.entries(WEEKDAY_LABELS).map(([v, l]) => (
                            <FormField
                              key={v}
                              control={form.control}
                              name="holiday_weekdays"
                              render={({ field }) => {
                                const checked = field.value?.includes(
                                  v as never,
                                );
                                return (
                                  <Label className="flex items-center gap-2 font-normal">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(c) => {
                                        const next = new Set(field.value ?? []);
                                        if (c) next.add(v as never);
                                        else next.delete(v as never);
                                        field.onChange(Array.from(next));
                                      }}
                                    />
                                    {l}
                                  </Label>
                                );
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="annual_leave"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>年次有給休暇</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="法定通り付与する場合は空欄でも結構です。"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToNextSection("sec5")}
                  >
                    次のセクションへ →
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ========== 6. 賃金 ========== */}
            <AccordionItem
              value="sec6"
              id="sec6"
              className="border-l-4 border-l-sky-400"
            >
              <AccordionTrigger className="px-4 text-base">
                <span className="flex items-center">
                  6. 賃金
                  <SectionDot status={sectionStatuses.sec6} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FormField
                  control={form.control}
                  name="wage_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        賃金形態<Req />
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="monthly">月給</SelectItem>
                          <SelectItem value="daily_monthly">
                            日給月給
                          </SelectItem>
                          <SelectItem value="hourly">時給</SelectItem>
                          <SelectItem value="daily">日給</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="basic_wage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        基本給(円)<Req />
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder="例:250000"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            field.onChange(raw === "" ? "" : Number(raw));
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        最低賃金との比較チェックを行います。
                      </FormDescription>
                      <MinWageStatus
                        prefecture={prefecture}
                        minimumWage={minimumWage}
                        result={minWageResult}
                        wageType={wageType}
                        workTimeType={workTimeType}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="has_fixed_overtime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        固定残業代(みなし残業手当)の有無<Req />
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4 pt-1"
                        >
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="no" /> なし
                          </Label>
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="yes" /> あり
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        基本給に毎月定額の残業代を含めて支給している場合は「あり」。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasFixedOvertime === "yes" && (
                  <div
                    role="status"
                    className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900"
                  >
                    <p className="font-medium">事務所側で確認・追記する項目</p>
                    <p className="mt-1 text-xs">
                      固定残業代の名称・金額・時間数(みなし残業時間)は、
                      ご依頼元の事務所側で確認のうえ追記しますので、入力は不要です。
                    </p>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="has_allowances"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        諸手当の有無(通勤手当等)<Req />
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4 pt-1"
                        >
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="no" /> なし
                          </Label>
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="yes" /> あり
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasAllowances === "yes" && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="text-sm font-medium">
                      手当の内訳(通勤手当もここに含めてください)
                    </div>
                    {allowances.fields.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        「手当を追加」ボタンから手当種別を選択してください。
                      </p>
                    )}
                    {allowances.fields.map((f, idx) => (
                      <AllowanceEditorCard
                        key={f.id}
                        idx={idx}
                        form={form}
                        isOpen={expandedAllowanceIdx === idx}
                        onExpand={() => setExpandedAllowanceIdx(idx)}
                        onCollapse={() => setExpandedAllowanceIdx(-1)}
                        onRemove={() => {
                          allowances.remove(idx);
                          setExpandedAllowanceIdx(-1);
                        }}
                      />
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const newIdx = allowances.fields.length;
                        allowances.append(emptyAllowanceItem("commute"));
                        setExpandedAllowanceIdx(newIdx);
                      }}
                    >
                      手当を追加
                    </Button>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="payment_cutoff_day"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          賃金締切日<Req />
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="end">月末</SelectItem>
                            <SelectItem value="10">10日</SelectItem>
                            <SelectItem value="15">15日</SelectItem>
                            <SelectItem value="20">20日</SelectItem>
                            <SelectItem value="25">25日</SelectItem>
                            <SelectItem value="other">その他</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {paymentCutoff === "other" && (
                    <FormField
                      control={form.control}
                      name="payment_cutoff_other"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            締切日(その他)<Req />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="例:10日" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="payment_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          賃金支払日<Req />
                        </FormLabel>
                        <PaymentDateSelect
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        支払方法<Req />
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4 pt-1"
                        >
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="bank_transfer" /> 口座振込
                          </Label>
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="cash" /> 現金
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

<FormField
                  control={form.control}
                  name="salary_increase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>昇給</FormLabel>
                      <PresetOrOtherField
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        presets={SALARY_INCREASE_PRESETS}
                        otherPlaceholder="昇給についての自由記述"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bonus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>賞与</FormLabel>
                      <PresetOrOtherField
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        presets={BONUS_PRESETS}
                        otherPlaceholder="賞与についての自由記述"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="retirement_allowance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>退職金</FormLabel>
                      <PresetOrOtherField
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        presets={RETIREMENT_ALLOWANCE_PRESETS}
                        otherLabel="有(自由記述)"
                        otherPlaceholder="退職金制度の内容を自由記述"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToNextSection("sec6")}
                  >
                    次のセクションへ →
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ========== 7. 社会保険・退職・定年等 ========== */}
            <AccordionItem
              value="sec7"
              id="sec7"
              className="border-l-4 border-l-sky-400"
            >
              <AccordionTrigger className="px-4 text-base">
                <span className="flex items-center">
                  7. 社会保険・退職・定年等
                  <SectionDot status={sectionStatuses.sec7} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FormField
                  control={form.control}
                  name="social_insurance"
                  render={() => (
                    <FormItem>
                      <FormLabel>
                        社会保険加入<Req />
                      </FormLabel>
                      <div className="flex flex-wrap gap-4 pt-1">
                        {(
                          ["health", "pension", "employment", "rousai"] as const
                        ).map((v) => (
                          <FormField
                            key={v}
                            control={form.control}
                            name="social_insurance"
                            render={({ field }) => {
                              const checked = field.value?.includes(v);
                              const isRousai = v === "rousai";
                              return (
                                <Label className="flex items-center gap-2 font-normal">
                                  <Checkbox
                                    checked={checked}
                                    disabled={isRousai}
                                    onCheckedChange={(c) => {
                                      const next = new Set(field.value ?? []);
                                      if (c) next.add(v);
                                      else next.delete(v);
                                      field.onChange(Array.from(next));
                                    }}
                                  />
                                  {SOCIAL_INSURANCE_LABELS[v]}
                                  {isRousai && (
                                    <span className="text-xs text-muted-foreground">
                                      (常時加入)
                                    </span>
                                  )}
                                </Label>
                              );
                            }}
                          />
                        ))}
                      </div>
                      {weeklyScheduledHours !== null &&
                        weeklyScheduledHours >= 20 && (
                          <div
                            role="status"
                            className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
                          >
                            現在の週所定労働時間は約{" "}
                            <b>{weeklyScheduledHours.toFixed(1)}</b> 時間です。
                            {weeklyScheduledHours >= 30
                              ? "週30時間以上のため、健康保険・厚生年金・雇用保険の加入が推奨されます。"
                              : "週20時間以上のため、雇用保険の加入が推奨されます。"}
                          </div>
                        )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="retirement_clause"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>退職に関する事項</FormLabel>
                      <FormDescription>
                        就業規則に記載されている内容を参照する形式が一般的です。特別な定めがある場合のみ「その他」から自由記述してください。
                      </FormDescription>
                      <PresetOrOtherField
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        presets={RETIREMENT_CLAUSE_PRESETS}
                        otherLabel="その他(自由記述)"
                        otherPlaceholder="退職に関する事項を自由記述"
                      />
                      <details className="text-[11px] leading-relaxed text-muted-foreground">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          詳細(法令解説)
                        </summary>
                        <p className="mt-1">
                          労基法15条・施行規則5条で明示必須の事項です。就業規則を参照する形式でも適法とされています(厚生労働省モデル労働条件通知書準拠)。
                        </p>
                      </details>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="retirement_age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>定年</FormLabel>
                      <FormDescription>
                        一般的な定めは「60歳定年(65歳まで再雇用)」です。御社の就業規則に合わせて選択してください。
                      </FormDescription>
                      <PresetOrOtherField
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        presets={RETIREMENT_AGE_PRESETS}
                        otherLabel="その他(自由記述)"
                        otherPlaceholder="定年の定めを自由記述"
                      />
                      <details className="text-[11px] leading-relaxed text-muted-foreground">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          詳細(法令解説)
                        </summary>
                        <p className="mt-1">
                          高年齢者雇用安定法8条により、定年を定める場合は60歳以上とする必要があります。また同法9条により65歳までの雇用確保措置(定年の引上げ・継続雇用制度・定年廃止のいずれか)が義務付けられています。
                        </p>
                      </details>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>備考・特記事項</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> 必須項目 /{" "}
              <span className="text-amber-600">*(2024年改正)</span>{" "}
              2024年4月労基法改正で追加された必須項目
            </p>
            <Button
              type="submit"
              size="lg"
              disabled={
                submitting ||
                form.formState.isSubmitting ||
                (!isAdminEdit && hasMinWageError) ||
                Object.keys(form.formState.errors).length > 0
              }
            >
              {isAdminEdit
                ? submitting
                  ? "保存中..."
                  : "保存"
                : submitting
                  ? "送信中..."
                  : "送信"}
            </Button>
          </div>
        </form>
        <BusyOverlay
          show={submitting}
          label={isAdminEdit ? "保存中..." : "送信中..."}
        />
        </div>
      </Form>
    </Wrapper>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  clientFormSchema,
  deriveDefaultsFromTemplate,
  isContractStartInPast,
  type ClientFormValues,
} from "@/lib/validations/client-form";
import {
  calcMonthlyWorkHours,
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
    <span className={kaisei ? "text-amber-600" : "text-destructive"}>
      {kaisei ? " *(2024年改正)" : " *"}
    </span>
  );
}

export function CustomerForm({ request }: { request: RequestSummary }) {
  const derived = useMemo(
    () => deriveDefaultsFromTemplate(request.template_name),
    [request.template_name],
  );

  const form = useForm<ClientFormValues>({
    // @hookform/resolvers@5 × zod@4 の型推論差異を回避するためのキャスト。
    // ランタイム動作は問題なく、フィールド名の型安全性は useForm<ClientFormValues> で担保される。
    resolver: zodResolver(clientFormSchema) as unknown as Resolver<ClientFormValues>,
    mode: "onBlur",
    defaultValues: {
      last_name: "",
      first_name: "",
      last_name_kana: "",
      first_name_kana: "",
      birth_date: "",
      gender: undefined,
      postal_code: "",
      address: "",
      phone: "",
      email: "",
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
      remote_work: undefined,
      job_description_initial: "",
      job_description_scope: "",
      work_time_type: "fixed",
      start_time: "",
      end_time: "",
      break_minutes: "",
      shift_note: "",
      holidays: [],
      holiday_weekdays: [],
      annual_leave: "",
      wage_type: "monthly",
      basic_wage: 0,
      has_allowances: "no",
      allowances: [],
      commute_allowance: "",
      payment_cutoff_day: "end",
      payment_cutoff_other: "",
      payment_date: "",
      payment_method: "bank_transfer",
      salary_increase: "",
      bonus: "",
      retirement_allowance: "",
      social_insurance: ["rousai"],
      retirement_clause: "",
      retirement_age: "",
      remarks: "",
    },
  });

  const allowances = useFieldArray({
    control: form.control,
    name: "allowances",
  });

  const employmentType = form.watch("employment_type");
  const hasContractPeriod = form.watch("has_contract_period");
  const renewalLimitExists = form.watch("renewal_limit_exists");
  const hasProbation = form.watch("has_probation");
  const workTimeType = form.watch("work_time_type");
  const hasAllowances = form.watch("has_allowances");
  const paymentCutoff = form.watch("payment_cutoff_day");
  const holidays = form.watch("holidays");

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
    last_name_kana: "姓(フリガナ)",
    first_name_kana: "名(フリガナ)",
    birth_date: "生年月日",
    postal_code: "郵便番号",
    address: "住所",
    phone: "電話番号",
    email: "メールアドレス",
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
    payment_cutoff_day: "賃金締切日",
    payment_cutoff_other: "賃金締切日(その他)",
    payment_date: "賃金支払日",
    social_insurance: "社会保険",
  };

  const onSubmit = (values: ClientFormValues) => {
    // eslint-disable-next-line no-console
    console.log("[C-01 送信(仮)]", {
      access_token: request.access_token,
      request_id: request.id,
      values,
    });
    alert(
      "送信処理は次フェーズ(プロンプト3-C)で実装します。\nブラウザのコンソールに入力内容を出力しました。",
    );
  };

  const onInvalid = (errors: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.warn("[C-01 バリデーションエラー]", errors);
    const firstKey = Object.keys(errors)[0];
    if (firstKey) {
      const el = document.querySelector<HTMLElement>(`[name="${firstKey}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      {/* 会社情報ヘッダー */}
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

      {/* エラーサマリ: form.formState.errors を集約表示 */}
      {Object.keys(form.formState.errors).length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            入力内容に不備があります。下記をご確認ください。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
            {Object.entries(form.formState.errors).map(([name, err]) => {
              const msg =
                (err as { message?: string } | undefined)?.message ??
                "入力を確認してください";
              const label = FIELD_LABELS[name] ?? name;
              return (
                <li key={name}>
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => {
                      const el = document.querySelector<HTMLElement>(
                        `[name="${name}"]`,
                      );
                      el?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                      (el as HTMLInputElement | null)?.focus?.();
                    }}
                  >
                    {label}: {msg}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          className="space-y-4"
          noValidate
        >
          <Accordion
            type="multiple"
            defaultValue={["sec1"]}
            className="rounded-lg border bg-card"
          >
            {/* ========== 1. 労働者基本情報 ========== */}
            <AccordionItem value="sec1">
              <AccordionTrigger className="px-4 text-base">
                1. 労働者基本情報
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
                          <Input autoComplete="family-name" {...field} />
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
                          <Input autoComplete="given-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="last_name_kana"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          姓(フリガナ)<Req />
                        </FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="first_name_kana"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          名(フリガナ)<Req />
                        </FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="birth_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        生年月日(西暦)<Req />
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
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>性別</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-wrap gap-4 pt-1"
                        >
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="male" /> 男
                          </Label>
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="female" /> 女
                          </Label>
                          <Label className="flex items-center gap-2 font-normal">
                            <RadioGroupItem value="no_answer" /> 回答しない
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        社会保険・税務手続きで使用します。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postal_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        郵便番号(ハイフンなし7桁)<Req />
                      </FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="postal-code"
                          placeholder="1000001"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        住所(都道府県以下)<Req />
                      </FormLabel>
                      <FormControl>
                        <Input autoComplete="street-address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          電話番号<Req />
                        </FormLabel>
                        <FormControl>
                          <Input
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="09012345678"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>メールアドレス</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          電子交付をご利用の場合は必須です。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ========== 2. 雇用区分・契約期間 ========== */}
            <AccordionItem value="sec2">
              <AccordionTrigger className="px-4 text-base">
                2. 雇用区分・契約期間
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
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ========== 3. 就業場所 ========== */}
            <AccordionItem value="sec3">
              <AccordionTrigger className="px-4 text-base">
                3. 就業場所
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
                <FormField
                  control={form.control}
                  name="remote_work"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>在宅勤務の有無</FormLabel>
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
              </AccordionContent>
            </AccordionItem>

            {/* ========== 4. 業務内容 ========== */}
            <AccordionItem value="sec4">
              <AccordionTrigger className="px-4 text-base">
                4. 業務内容
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
              </AccordionContent>
            </AccordionItem>

            {/* ========== 5. 所定労働時間・休日 ========== */}
            <AccordionItem value="sec5">
              <AccordionTrigger className="px-4 text-base">
                5. 所定労働時間・休日
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
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              休憩時間(分)<Req />
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                inputMode="numeric"
                                placeholder="60"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              労働時間6h超→45分以上、8h超→60分以上
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
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
              </AccordionContent>
            </AccordionItem>

            {/* ========== 6. 賃金 ========== */}
            <AccordionItem value="sec6">
              <AccordionTrigger className="px-4 text-base">
                6. 賃金
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
                        />
                      </FormControl>
                      <FormDescription>
                        最低賃金との比較チェックを行います。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="has_allowances"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        諸手当の有無<Req />
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
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="text-sm font-medium">諸手当の内訳</div>
                    {allowances.fields.map((f, idx) => (
                      <div
                        key={f.id}
                        className="grid gap-2 md:grid-cols-[1fr_160px_auto]"
                      >
                        <FormField
                          control={form.control}
                          name={`allowances.${idx}.name` as const}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  placeholder="手当名(例:役職手当)"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`allowances.${idx}.amount` as const}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="金額(円)"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => allowances.remove(idx)}
                        >
                          削除
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => allowances.append({ name: "", amount: 0 })}
                    >
                      手当を追加
                    </Button>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="commute_allowance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>通勤手当(円)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder="支給しない場合は空欄"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                            <SelectItem value="15">15日</SelectItem>
                            <SelectItem value="20">20日</SelectItem>
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
                        <FormControl>
                          <Input
                            placeholder="例:翌月25日、月末"
                            {...field}
                          />
                        </FormControl>
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
                      <FormControl>
                        <Textarea
                          placeholder="例:年1回・人事考課による(就業規則による)"
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
                  name="bonus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>賞与</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例:年2回(7月・12月)、業績による"
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
                  name="retirement_allowance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>退職金</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例:就業規則による / 制度なし"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </AccordionContent>
            </AccordionItem>

            {/* ========== 7. その他 ========== */}
            <AccordionItem value="sec7">
              <AccordionTrigger className="px-4 text-base">
                7. その他
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
                      <FormControl>
                        <Textarea
                          placeholder="例:自己都合退職は30日前までに届け出(就業規則による)"
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
                  name="retirement_age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>定年</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="例:満60歳に達した月の末日"
                          {...field}
                        />
                      </FormControl>
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
                form.formState.isSubmitting ||
                hasMinWageError ||
                Object.keys(form.formState.errors).length > 0
              }
            >
              送信(仮)
            </Button>
          </div>
        </form>
      </Form>
    </main>
  );
}

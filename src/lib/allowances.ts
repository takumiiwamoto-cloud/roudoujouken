/**
 * 諸手当の選択肢・バリデーション・docx 差し込み用 description 生成を
 * まとめた共有モジュール(クライアント/サーバー共用・純関数のみ)。
 */

export const allowanceTypeValues = [
  "commute",
  "housing",
  "family",
  "position",
  "qualification",
  "attendance",
  "job",
  "other",
] as const;
export type AllowanceType = (typeof allowanceTypeValues)[number];

export const ALLOWANCE_TYPE_LABELS: Record<AllowanceType, string> = {
  commute: "通勤手当",
  housing: "住宅手当",
  family: "家族手当",
  position: "役職手当",
  qualification: "資格手当",
  attendance: "皆勤手当",
  job: "業務手当・職務手当",
  other: "その他",
};

export type AllowanceFieldKey =
  | "amount"
  | "percentage"
  | "upper_limit"
  | "spouse_amount"
  | "child_amount"
  | "free_text";

export type AllowancePatternDef = {
  id: string;
  label: string;
  /** このパターンで顧客に入力させる追加フィールド。 */
  fields: AllowanceFieldKey[];
  /** 自由記述フィールドの placeholder(任意)。 */
  freeTextPlaceholder?: string;
};

export const ALLOWANCE_PATTERNS: Record<AllowanceType, AllowancePatternDef[]> = {
  commute: [
    { id: "actual_expense_no_limit", label: "実費支給(上限なし)", fields: [] },
    {
      id: "actual_expense_with_limit",
      label: "実費支給(上限あり)",
      fields: ["upper_limit"],
    },
    { id: "monthly_fixed", label: "月額固定支給", fields: ["amount"] },
    {
      id: "distance_based",
      label: "距離に応じて支給",
      fields: ["free_text"],
      freeTextPlaceholder: "例: 15km未満5,000円、15km以上10,000円",
    },
    { id: "commuter_pass", label: "定期券代相当額支給", fields: [] },
    { id: "per_regulation", label: "賃金規程による", fields: [] },
    {
      id: "other_free",
      label: "その他",
      fields: ["free_text"],
      freeTextPlaceholder: "支給条件を自由記述",
    },
  ],
  housing: [
    { id: "monthly_fixed", label: "月額固定支給", fields: ["amount"] },
    {
      id: "rent_percentage",
      label: "家賃の一定割合",
      fields: ["percentage", "upper_limit"],
    },
    { id: "household_head_only", label: "世帯主のみ支給", fields: ["amount"] },
    { id: "per_regulation", label: "賃金規程による", fields: [] },
    {
      id: "other_free",
      label: "その他",
      fields: ["free_text"],
      freeTextPlaceholder: "支給条件を自由記述",
    },
  ],
  family: [
    {
      id: "per_dependent",
      label: "扶養家族1人あたり定額",
      fields: ["amount"],
    },
    {
      id: "spouse_and_child",
      label: "配偶者+子別支給",
      fields: ["spouse_amount", "child_amount"],
    },
    { id: "per_regulation", label: "賃金規程による", fields: [] },
    {
      id: "other_free",
      label: "その他",
      fields: ["free_text"],
      freeTextPlaceholder: "支給条件を自由記述",
    },
  ],
  position: [
    {
      id: "position_based",
      label: "役職別支給(賃金規程による)",
      fields: [],
    },
    { id: "monthly_fixed", label: "月額固定支給", fields: ["amount"] },
    {
      id: "other_free",
      label: "その他",
      fields: ["free_text"],
      freeTextPlaceholder: "支給条件を自由記述",
    },
  ],
  qualification: [
    {
      id: "qualification_based",
      label: "資格の種類により支給(賃金規程による)",
      fields: [],
    },
    { id: "monthly_fixed", label: "月額固定支給", fields: ["amount"] },
    {
      id: "other_free",
      label: "その他",
      fields: ["free_text"],
      freeTextPlaceholder: "支給条件を自由記述",
    },
  ],
  attendance: [
    { id: "monthly_fixed", label: "月額固定支給", fields: ["amount"] },
    { id: "per_regulation", label: "賃金規程による", fields: [] },
    {
      id: "other_free",
      label: "その他",
      fields: ["free_text"],
      freeTextPlaceholder: "支給条件を自由記述",
    },
  ],
  job: [
    { id: "monthly_fixed", label: "月額固定支給", fields: ["amount"] },
    {
      id: "job_based",
      label: "業務別支給(賃金規程による)",
      fields: [],
    },
    {
      id: "other_free",
      label: "その他",
      fields: ["free_text"],
      freeTextPlaceholder: "支給条件を自由記述",
    },
  ],
  other: [
    {
      id: "other_free",
      label: "自由記述",
      fields: ["free_text"],
      freeTextPlaceholder: "手当名称・金額・支給条件をすべて記述",
    },
  ],
};

export function findPatternDef(
  type: string | undefined,
  pattern: string | undefined,
): AllowancePatternDef | null {
  if (!type || !pattern) return null;
  const list = ALLOWANCE_PATTERNS[type as AllowanceType] ?? [];
  return list.find((p) => p.id === pattern) ?? null;
}

// ---------- 正規化(レガシー {name, amount} → 新構造) ----------

export type AllowanceItem = {
  allowance_type: AllowanceType;
  allowance_name: string;
  allowance_pattern: string;
  allowance_amount: number | null;
  allowance_percentage: number | null;
  allowance_upper_limit: number | null;
  allowance_spouse_amount: number | null;
  allowance_child_amount: number | null;
  allowance_free_text: string | null;
};

export function emptyAllowanceItem(
  type: AllowanceType = "commute",
): AllowanceItem {
  return {
    allowance_type: type,
    allowance_name: ALLOWANCE_TYPE_LABELS[type],
    allowance_pattern: "",
    allowance_amount: null,
    allowance_percentage: null,
    allowance_upper_limit: null,
    allowance_spouse_amount: null,
    allowance_child_amount: null,
    allowance_free_text: null,
  };
}

function coerceNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function coerceStringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

/**
 * 既存/新規どちらの形式で来ても新構造に揃える。
 *   - 新形式: allowance_type が存在 → そのまま
 *   - 旧形式: { name, amount } → 手当種別を名称から推定し、月額固定に寄せる
 */
export function normalizeAllowanceEntry(raw: unknown): AllowanceItem {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r.allowance_type === "string") {
      const t = (allowanceTypeValues as readonly string[]).includes(
        r.allowance_type,
      )
        ? (r.allowance_type as AllowanceType)
        : "other";
      return {
        allowance_type: t,
        allowance_name:
          typeof r.allowance_name === "string" && r.allowance_name
            ? r.allowance_name
            : ALLOWANCE_TYPE_LABELS[t],
        allowance_pattern:
          typeof r.allowance_pattern === "string" ? r.allowance_pattern : "",
        allowance_amount: coerceNumberOrNull(r.allowance_amount),
        allowance_percentage: coerceNumberOrNull(r.allowance_percentage),
        allowance_upper_limit: coerceNumberOrNull(r.allowance_upper_limit),
        allowance_spouse_amount: coerceNumberOrNull(r.allowance_spouse_amount),
        allowance_child_amount: coerceNumberOrNull(r.allowance_child_amount),
        allowance_free_text: coerceStringOrNull(r.allowance_free_text),
      };
    }
    // legacy { name, amount }
    const name = typeof r.name === "string" ? r.name : "";
    const amount =
      typeof r.amount === "number" && Number.isFinite(r.amount)
        ? r.amount
        : null;
    const guessed: AllowanceType =
      name.includes("通勤")
        ? "commute"
        : name.includes("住宅") || name.includes("家賃")
          ? "housing"
          : name.includes("家族") || name.includes("扶養")
            ? "family"
            : name.includes("役職")
              ? "position"
              : name.includes("資格") || name.includes("技能")
                ? "qualification"
                : name.includes("皆勤") || name.includes("精勤")
                  ? "attendance"
                  : "other";
    return {
      allowance_type: guessed,
      allowance_name: name || ALLOWANCE_TYPE_LABELS[guessed],
      allowance_pattern: amount !== null ? "monthly_fixed" : "other_free",
      allowance_amount: amount,
      allowance_percentage: null,
      allowance_upper_limit: null,
      allowance_spouse_amount: null,
      allowance_child_amount: null,
      allowance_free_text: amount === null && name ? name : null,
    };
  }
  return emptyAllowanceItem("other");
}

// ---------- description 生成(docx 差し込み用) ----------

function yen(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}

export function buildAllowanceDescription(v: AllowanceItem): string {
  const p = v.allowance_pattern;
  const freeText = v.allowance_free_text?.trim() ?? "";

  switch (p) {
    case "actual_expense_no_limit":
      return "実費支給";
    case "actual_expense_with_limit": {
      const lim = yen(v.allowance_upper_limit);
      return lim ? `実費支給(月額上限${lim}円)` : "実費支給(上限あり)";
    }
    case "monthly_fixed": {
      const a = yen(v.allowance_amount);
      return a ? `月額${a}円` : "月額固定支給";
    }
    case "distance_based":
      return freeText
        ? `通勤距離に応じて支給(${freeText})`
        : "通勤距離に応じて支給";
    case "commuter_pass":
      return "定期券代相当額支給";
    case "per_regulation":
      return "賃金規程による";
    case "rent_percentage": {
      const pct =
        typeof v.allowance_percentage === "number"
          ? v.allowance_percentage
          : null;
      const lim = yen(v.allowance_upper_limit);
      if (pct !== null && lim) return `家賃の${pct}%(月額上限${lim}円)`;
      if (pct !== null) return `家賃の${pct}%`;
      if (lim) return `家賃の一定割合(月額上限${lim}円)`;
      return "家賃の一定割合";
    }
    case "household_head_only": {
      const a = yen(v.allowance_amount);
      return a ? `世帯主のみ月額${a}円` : "世帯主のみ支給";
    }
    case "per_dependent": {
      const a = yen(v.allowance_amount);
      return a ? `扶養家族1人あたり月額${a}円` : "扶養家族1人あたり定額";
    }
    case "spouse_and_child": {
      const sp = yen(v.allowance_spouse_amount);
      const ch = yen(v.allowance_child_amount);
      const parts: string[] = [];
      if (sp) parts.push(`配偶者${sp}円`);
      if (ch) parts.push(`子1人あたり${ch}円`);
      return parts.length ? parts.join("、") : "配偶者+子別支給";
    }
    case "position_based":
      return "役職別に賃金規程による支給";
    case "qualification_based":
      return "資格の種類により賃金規程による支給";
    case "job_based":
      return "業務別に賃金規程による支給";
    case "other_free":
      return freeText;
    default:
      return "";
  }
}

/**
 * 保存前の最終整形。配列の各要素に allowance_description を付与して返す。
 * /api/submit と saveClientInputAction から呼び出す。
 */
export function withAllowanceDescriptions<T extends AllowanceItem>(
  items: T[] | undefined | null,
): Array<T & { allowance_description: string }> {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    ...it,
    allowance_description: buildAllowanceDescription(it),
  }));
}

import { createAdminClient } from "@/lib/supabase/admin";
import { CustomerForm } from "./customer-form";

/**
 * C-01 入力フォーム(顧客向け・トークン認証)
 *
 * Server Component でトークン検証 → 有効な場合のみ Client 側のフォームを描画。
 * RLS は anon 拒否としているため、service_role を使う createAdminClient で取得する
 * (CLAUDE.md / migrations/20260422_001 のポリシーと整合)。
 */

export const dynamic = "force-dynamic";

type InvalidReason = "not_found" | "expired" | "already_submitted";

function InvalidTokenView({ reason }: { reason: InvalidReason }) {
  const messages: Record<InvalidReason, { title: string; body: string }> = {
    not_found: {
      title: "URLが無効です",
      body: "お渡ししたURLを正しくご入力いただいているかご確認ください。ご不明な場合は依頼元の事務所までお問い合わせください。",
    },
    expired: {
      title: "有効期限が切れています",
      body: "この入力URLは有効期限を過ぎています。依頼元の事務所に連絡し、新しいURLの発行をご依頼ください。",
    },
    already_submitted: {
      title: "すでにご入力済みです",
      body: "このURLからの入力はすでに完了しています。内容の修正が必要な場合は依頼元の事務所までご連絡ください。",
    },
  };
  const msg = messages[reason];
  return (
    <main className="mx-auto max-w-xl p-6 md:p-8">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="text-xl font-bold text-destructive">{msg.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {msg.body}
        </p>
      </div>
    </main>
  );
}

export default async function CustomerFormPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("contract_requests")
    .select(
      "id, access_token, status, expires_at, company_name, company_address, representative_name, template_name",
    )
    .eq("access_token", params.token)
    .maybeSingle();

  if (!data) return <InvalidTokenView reason="not_found" />;
  if (new Date(data.expires_at) < new Date()) {
    return <InvalidTokenView reason="expired" />;
  }
  if (data.status !== "pending") {
    return <InvalidTokenView reason="already_submitted" />;
  }

  return (
    <CustomerForm
      request={{
        id: data.id,
        access_token: data.access_token,
        company_name: data.company_name,
        company_address: data.company_address,
        representative_name: data.representative_name,
        template_name: data.template_name,
      }}
    />
  );
}

-- =====================================================================
-- contract_requests テーブル作成
-- 設計書 v3 / Sheet08「DB設計」準拠
-- 契約書作成依頼のメインテーブル。1依頼=1行、会社情報を内包する方式
-- (顧問先マスタは持たない)。
-- =====================================================================

-- UUID 生成関数を有効化(gen_random_uuid 用)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------
-- 汎用: updated_at 自動更新トリガー関数
-- 他テーブルでも使い回せるよう共通化。
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------
-- メインテーブル
-- -----------------------------------------------------------------
CREATE TABLE public.contract_requests (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token         text         NOT NULL UNIQUE,
  status               text         NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','submitted','reviewed','delivered')),
  expires_at           timestamptz  NOT NULL,
  company_name         text         NOT NULL,
  company_address      text         NOT NULL,
  representative_name  text         NOT NULL,
  template_name        text         NOT NULL,
  client_input         jsonb,
  office_input         jsonb,
  generated_docx_path  text,
  submitted_at         timestamptz,
  delivered_at         timestamptz,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.contract_requests IS
  '契約書作成依頼(設計書 Sheet08)。1依頼=1行、会社情報を内包。';
COMMENT ON COLUMN public.contract_requests.access_token IS
  '顧客向けURLトークン(ランダム生成)。URL: /form/<access_token>';
COMMENT ON COLUMN public.contract_requests.status IS
  'pending(URL発行済)→submitted(顧客入力完了)→reviewed(事務所確認済)→delivered(納品済)';
COMMENT ON COLUMN public.contract_requests.expires_at IS
  'トークン有効期限(既定14日)。過ぎたらアクセス拒否。';
COMMENT ON COLUMN public.contract_requests.template_name IS
  '使用するひな形ファイル名(例:労働条件通知書_ひな形_正社員.docx)。';
COMMENT ON COLUMN public.contract_requests.client_input IS
  '顧客入力(Sheet02 の45項目)を jsonb で格納。';
COMMENT ON COLUMN public.contract_requests.office_input IS
  '事務所側入力(Sheet03 の29項目)を jsonb で格納。';
COMMENT ON COLUMN public.contract_requests.generated_docx_path IS
  'Supabase Storage 上の生成済 docx パス。';

-- -----------------------------------------------------------------
-- インデックス
--   access_token は UNIQUE 制約で自動インデックス化されるため別途不要。
-- -----------------------------------------------------------------
-- 期限切れレコードのバッチ削除/検索用
CREATE INDEX idx_contract_requests_expires_at
  ON public.contract_requests (expires_at);

-- 一覧画面のステータス別フィルタ用
CREATE INDEX idx_contract_requests_status
  ON public.contract_requests (status);

-- -----------------------------------------------------------------
-- トリガー: UPDATE 時に updated_at を自動更新
-- -----------------------------------------------------------------
CREATE TRIGGER trg_contract_requests_updated_at
  BEFORE UPDATE ON public.contract_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- Row Level Security
--
-- 方針(CLAUDE.md / src/lib/supabase/admin.ts のコメントと整合):
--   - 事務所スタッフ(authenticated ロール): 全件 CRUD 可能
--   - 顧客(anon ロール): RLS 経由では直接アクセスさせない。
--     顧客フォーム(C-01)は Next.js の Route Handler / Server Action から
--     service_role キーを使ってトークン検証 → 読み書きする方式で実装する。
--     (RLS でトークン文字列を直接検証する方式は JWT カスタムクレーム等が
--      必要で複雑化するため、ここでは採らない。)
--   - service_role は RLS をバイパスするので、API Route 経由のアクセスは
--     このポリシーの影響を受けない。
-- =====================================================================
ALTER TABLE public.contract_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access"
  ON public.contract_requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- anon 向けポリシーは意図的に未作成(= 全操作拒否)。

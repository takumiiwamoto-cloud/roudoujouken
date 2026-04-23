-- =====================================================================
-- minimum_wage_master テーブル作成
-- 設計書 v3 / Sheet08「DB設計」準拠
-- 都道府県別 地域別最低賃金マスタ。年1回(例年10月)の官報改定値で更新運用。
-- =====================================================================

CREATE TABLE public.minimum_wage_master (
  prefecture      text  PRIMARY KEY,
  hourly_wage     int   NOT NULL CHECK (hourly_wage > 0),
  effective_date  date  NOT NULL
);

COMMENT ON TABLE  public.minimum_wage_master IS
  '都道府県別最低賃金マスタ(設計書 Sheet08)。毎年10月改定値で上書き運用。';
COMMENT ON COLUMN public.minimum_wage_master.prefecture IS
  '都道府県名(例:東京・大阪・北海道)。「都」「府」「県」は省略、47レコード。';
COMMENT ON COLUMN public.minimum_wage_master.hourly_wage IS
  '地域別最低賃金の時間額(円)。月給は月所定時間に換算してアプリ側で比較。';
COMMENT ON COLUMN public.minimum_wage_master.effective_date IS
  '当該金額の発効日。厚生労働省の官報公示日と一致。';

-- =====================================================================
-- Row Level Security
--   - 全ユーザー(anon + authenticated): SELECT 可
--   - 書き込み(INSERT/UPDATE/DELETE): ポリシー未作成 = 拒否
--     年次の更新作業は Supabase Dashboard > SQL Editor または service_role で実施。
-- =====================================================================
ALTER TABLE public.minimum_wage_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read"
  ON public.minimum_wage_master
  FOR SELECT
  TO anon, authenticated
  USING (true);

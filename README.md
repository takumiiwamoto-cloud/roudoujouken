# 雇用契約書(労働条件通知書)自動作成ツール

社労士事務所向け。顧問先(事業主)→事務所(社労士)の協働で、URL発行→顧客入力→事務所追記→docx生成 までを補助するツール。

唯一の仕様書は `雇用契約書自動作成ツール_設計書_v3.xlsx`(全12シート)。実装に着手する前に必ず該当シートを参照すること。詳細な開発ルール・アーキテクチャは [`CLAUDE.md`](./CLAUDE.md) を参照。

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS v3 + shadcn/ui v2(new-york / zinc / lucide)
- Supabase(PostgreSQL + Auth + Storage)
- docxtemplater + pizzip(Word差し込み)
- Resend(メール送信)
- Vercel(ホスティング)

## 開発環境セットアップ手順

### 前提

- Node.js 20 以上(検証済 v24.15.0)
- pnpm 10 以上(検証済 v10.33.1)
- Git

### 1. リポジトリ取得と依存インストール

```bash
git clone https://github.com/takumiiwamoto-cloud/roudoujouken.git
cd roudoujouken
pnpm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env.local` を作成し、Supabase の値を埋める。

```bash
cp .env.example .env.local
```

`.env.local` に以下を設定:

| キー | 取得元 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL | クライアント/サーバー両方で使用 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同 > Project API keys > `anon` `public` | RLS 経由のアクセス用 |
| `SUPABASE_SERVICE_ROLE_KEY` | 同 > Project API keys > `service_role` `secret` | サーバー専用(`server-only` で保護) |
| `RESEND_API_KEY` | Resend Dashboard > API Keys | 通知メール送信用(Day 13で使用開始) |

`.env.local` は `.gitignore` 済。Vercel 等のホスティング側にも同名で設定すること。

### 3. 開発サーバー起動

```bash
pnpm dev
```

`http://localhost:3000` を開く(ルートは `/dashboard` にリダイレクトされる)。

### 4. 主要スクリプト

```bash
pnpm dev    # 開発サーバー
pnpm build  # 本番ビルド(型チェック含む)
pnpm start  # ビルド済を起動
pnpm lint   # ESLint
```

## ディレクトリ構成

```
src/
  app/
    (public)/                 # 顧客向け公開画面(トークン認証)
      form/[token]/page.tsx   # C-01 入力フォーム
      complete/page.tsx       # C-02 送信完了
    (admin)/                  # 事務所向け管理画面(Supabase Auth)
      login/page.tsx          # O-01 ログイン
      dashboard/page.tsx      # O-02 依頼一覧
      new/page.tsx            # O-03 依頼新規作成
      detail/[id]/page.tsx    # O-04 依頼詳細
    api/
      submit/route.ts         # 顧客送信
      generate-docx/route.ts  # docx生成
    page.tsx                  # ルート(/) → /dashboard リダイレクト
    layout.tsx                # 共通レイアウト
    globals.css               # Tailwind + shadcn変数
  components/
    ui/                       # shadcn/ui コンポーネント
  hooks/                      # カスタムフック(use-toast 等)
  lib/
    supabase/
      admin.ts                # service_role(サーバー専用)
      client.ts               # ブラウザ用(anon)
      server.ts               # Server Components 用(anon)
      middleware.ts           # セッション更新ヘルパ
    validations/              # Sheet05 のルール(Day 5-7/9-10で追加)
    constants/                # 定数(雇用形態・都道府県等)
    utils.ts                  # cn() ヘルパ
  types/                      # 型定義(DB型・入力型)
  middleware.ts               # 全パス共通middleware
templates/                    # docx ひな形(タグ埋め込み済)
```

## 開発フロー

1. 設計書 v3 の該当シートを必ず先に確認。
2. フェーズ単位(Day 単位)で実装し、フェーズ完了時に動作確認。
3. 設計書に記載のない仕様は推測で実装せず、必ず確認を取る。
4. 各フェーズ完了時に Conventional Commits 形式で git commit。

進捗ロードマップは設計書 Sheet10 を参照。

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクトの現状

社労士事務所向け「雇用契約書(労働条件通知書)自動作成ツール」。**実装はまだ開始しておらず、設計フェーズ完了の状態**。`雇用契約書自動作成ツール_設計書_v3.xlsx` が唯一の仕様書(全12シート)で、これが本プロジェクトの**唯一の真実の源(Single Source of Truth)**。コードを書く前に必ず該当シートを参照すること。

## 開発ルール(ユーザー指示・厳守)

- **複数フェーズを勝手に進めない**。各フェーズ(Day単位)完了時に必ず動作確認を求める。
- **設計書に記載のない仕様は推測で実装せず、必ず質問する**。
- 不確実な部分は確認を求めること。
- ロードマップは Sheet10。Day 1-3(ひな形準備)→ Day 4(環境構築)→ Day 5-7(顧客フォーム)→ Day 8(バリデーション)→ Day 9-10(管理画面)→ Day 11-12(docx生成)→ Day 13(メール通知)→ Day 14(UI調整)→ Day 15-17(試用)→ Day 18-(本番)。

## 設計書の読み方

この環境には Python(stub のみ)・LibreOffice・Node はインストールされていない。xlsx を読むには Perl を使う:

```bash
# xlsx は zip。一度展開してから perl パーサで各シートを読む
mkdir -p /tmp/xlsx_extract && unzip -o "雇用契約書自動作成ツール_設計書_v3.xlsx" -d /tmp/xlsx_extract > /dev/null
perl parse_xlsx.pl /tmp/xlsx_extract/xl/worksheets/sheet1.xml   # 01_概要
perl parse_xlsx.pl /tmp/xlsx_extract/xl/worksheets/sheet2.xml   # 02_顧客入力項目
# ... sheet3〜sheet12 まで同様
```

シート対応表:
- sheet1: 01_概要 / sheet2: 02_顧客入力項目(45項目) / sheet3: 03_事務所側入力項目(29項目)
- sheet4: 04_雇用形態別マトリクス / sheet5: 05_バリデーション(18ルール) / sheet6: 06_docx差し込みタグ(全タグ×4ひな形マトリクス)
- sheet7: 07_ワークフロー / sheet8: 08_DB設計 / sheet9: 09_画面一覧(7画面)
- sheet10: 10_ロードマップ / sheet11: 11_リスク管理 / sheet12: 12_更新履歴

`parse_xlsx.pl` はインラインストリング形式の xlsx 専用(sharedStrings.xml なし)。

## 技術スタック(Sheet1で確定済み)

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL + Auth + Storage)
- Vercel (hosting)
- docxtemplater (docx 生成)
- Resend (メール送信)

別の選択肢を採用したくなった場合は、**実装前に必ずユーザーに確認すること**。

## アーキテクチャの要点

**業務フロー**: 既存のメールワイズ(サイボウズ)運用は維持。本ツールは「URL発行→顧客入力→事務所追記→docx生成」の補助ツールとして差し込む(Sheet7)。

**役割分担**(Sheet1・Sheet2・Sheet3):
- 顧客(事業主): 事実情報のみ(氏名・住所・賃金額・所定労働時間など、迷わず入力できる項目)
- 事務所(社労士): 専門判断項目(変形労働時間制・管理監督者・固定残業代・試用期間中差異など、判例・実務知見を要する項目)
- システム: 自動チェック(最低賃金・必須項目・日付論理・2024年改正項目)

**DB設計の特徴**(Sheet8): 顧問先マスタは持たない。`contract_requests` テーブル1つに会社情報を内包し、顧客入力・事務所側入力はそれぞれ `client_input` / `office_input` の jsonb カラムに格納。`minimum_wage_master` は都道府県別の最低賃金マスタ(年1回更新)。

**ひな形は4種類**(Sheet4・Sheet6): 正社員 / 契約社員(有期) / パート無期 / パート有期。雇用形態によって表示する項目・タグが分岐する。タグは docxtemplater 形式: `{タグ}` `{#条件}...{/条件}` `{^条件}...{/条件}` `{#配列}...{/配列}`。Sheet6 にひな形種別ごとの「使用○/使用せず×」マトリクスがある。

**ひな形ファイルの場所**: `templates/` フォルダ。4 種類の docx は配置済み(`労働条件通知書_ひな形_{正社員|契約社員|パート無期|パート有期}.docx`)。Day 1-3 で docxtemplater タグを埋め込む作業が必要。

## 法令・判例対応(絶対に飛ばさない)

これらは Sheet5 のバリデーションでハードコード。実装時に必ず該当ルールを参照すること。

**2024年4月労基法改正(必須項目・未充足時は docx 生成ブロック)**:
- 就業場所の「変更の範囲」(全雇用形態必須)
- 業務の「変更の範囲」(全雇用形態必須)
- 有期契約の「更新上限の有無・内容」(契約社員・パート有期で必須)

**判例対応の自動チェック**:
- 固定残業代の適法性: `基礎賃金 × 1.25 × 時間数 ≦ 固定残業金額`(テックジャパン事件 H24.3.8 最判)
- 超過分支払の明記必須(国際自動車事件 R2.3.30 最判)
- 管理監督者判断は4要件で判定(日本マクドナルド事件 H20.1.28 東京地判)

**最低賃金チェック**: 都道府県別マスタと自動照合(月給は月所定時間で換算)。

**労基法34条**: 労働時間 6h 超 → 休憩 45分以上、8h 超 → 60分以上。

## ファイル/フォルダ構成

- `雇用契約書自動作成ツール_設計書_v3.xlsx` — **唯一の仕様書**
- `templates/` — Word ひな形 4 種類(配置済み、タグ埋め込み待ち)
- `parse_xlsx.pl` — 設計書 xlsx 読み取り用 Perl スクリプト
- `ClaudeCode投入プロンプト集.docx` — ユーザー側の運用ノート(参考)
- `.claude/` — Claude Code 設定

## 環境メモ

- Platform: Windows 11 / bash (Git Bash 系) / Perl 5.42 利用可
- Python (Microsoft Store スタブのみ・実体なし)、LibreOffice、Node は未インストール
- xlsx を編集して保存し直す手段は現状なし(読み取りのみ可)

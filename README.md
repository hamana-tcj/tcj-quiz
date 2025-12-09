This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## 環境変数の設定

### ローカル開発環境

`.env.local`ファイルを作成し、以下の環境変数を設定してください：

```env
# Supabase設定（既存）
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Supabase Admin API（ユーザー作成用）
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# kintone設定
KINTONE_SUBDOMAIN=your_kintone_subdomain
KINTONE_API_TOKEN=your_kintone_api_token
KINTONE_APP_ID=your_kintone_app_id
```

### Vercel（本番環境）での設定方法

1. **Vercelダッシュボードにログイン**
   - [https://vercel.com](https://vercel.com) にアクセス
   - プロジェクトを選択

2. **環境変数の設定画面を開く**
   - プロジェクトの「Settings」タブをクリック
   - 左側のメニューから「Environment Variables」を選択

3. **環境変数を追加**
   以下の環境変数を1つずつ追加します：

   | 変数名 | 説明 | 例 |
   |--------|------|-----|
   | `KINTONE_SUBDOMAIN` | kintoneのサブドメイン | `your-company` |
   | `KINTONE_API_TOKEN` | kintoneのAPIトークン | `xxxxxxxxxxxxxxxxxxxx` |
   | `KINTONE_APP_ID` | kintoneのアプリID | `846` |
   | `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのURL | `https://xxxxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | SupabaseのService Role Key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

   **追加手順**:
   - 「Add New」ボタンをクリック
   - 「Name」に変数名を入力（例: `KINTONE_SUBDOMAIN`）
   - 「Value」に値を入力
   - 「Environment」で適用環境を選択：
     - **Production**: 本番環境のみ
     - **Preview**: プレビュー環境（プルリクエストなど）
     - **Development**: 開発環境
     - 通常は**Production**と**Preview**の両方にチェックを入れます
   - 「Save」をクリック

4. **既存の環境変数を確認**
   - `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が既に設定されているか確認
   - 設定されていない場合は追加してください

5. **環境変数の反映（重要！）**
   - 環境変数を追加・変更した後は、**必ず再デプロイが必要**です
   - 再デプロイしないと、環境変数は反映されません
   - **再デプロイ手順**:
     1. 「Deployments」タブをクリック
     2. 最新のデプロイを選択（通常は一番上）
     3. 右側の「⋯」（三点リーダー）メニューをクリック
     4. 「Redeploy」を選択
     5. 「Redeploy」ボタンをクリック
   - 再デプロイが完了するまで数分かかります
   - 再デプロイ後、GitHub Actionsを再実行してください

### 環境変数の確認方法

Vercelダッシュボードの「Settings」→「Environment Variables」で、設定した環境変数が表示されます。

**注意**: 
- 環境変数の値は一度保存すると、セキュリティ上の理由で表示されません（`••••••••`のように表示されます）
- 変更する場合は、新しい値を入力して「Save」をクリックしてください

### 環境変数の取得方法

#### Supabase Service Role Key
1. Supabaseダッシュボードにログイン
2. Settings → API
3. `service_role` keyをコピー（**注意: このキーは機密情報です。絶対に公開しないでください**）

#### kintone API Token
1. kintoneにログイン
2. アプリの設定 → API設定
3. APIトークンを生成
4. 必要な権限を付与（レコード閲覧など）

## kintoneユーザー同期API

### エンドポイント

`POST /api/sync-kintone-users`

### 使用方法

#### 1. 単一ユーザー同期（Webhook用）

```javascript
const response = await fetch('/api/sync-kintone-users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    singleUser: 'user@example.com',
  }),
});
```

#### 2. バッチ処理（初回リリース時など）

```javascript
// 100ユーザーずつ処理
const response = await fetch('/api/sync-kintone-users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    batchSize: 100,
    offset: 0,
    emailFieldCode: 'email', // kintoneのメールアドレスフィールドコード
  }),
});

const result = await response.json();
// result.hasMore が true の場合は、次のバッチを処理
```

#### 3. 条件付き同期

```javascript
// 特定の条件でフィルタリング
const response = await fetch('/api/sync-kintone-users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'ステータス = "有効"',
    batchSize: 100,
  }),
});
```

### レスポンス形式

```json
{
  "success": true,
  "processed": 100,
  "created": 95,
  "updated": 2,
  "skipped": 3,
  "failed": 0,
  "hasMore": true,
  "nextOffset": 100,
  "message": "処理完了: 作成 95件, 更新 2件, スキップ 3件, 失敗 0件",
  "errors": []
}
```

**レスポンスフィールドの説明**:
- `processed`: 処理したレコード数
- `created`: 新規作成したユーザー数
- `updated`: メールアドレスを更新したユーザー数
- `skipped`: スキップしたレコード数（既に存在するユーザー）
- `failed`: 失敗したレコード数
- `hasMore`: 次のバッチがあるかどうか
- `nextOffset`: 次のバッチのオフセット
- `errors`: エラー詳細の配列

### メールアドレス更新機能

kintoneでメールアドレスが変更された場合、自動的にSupabaseのユーザーメールアドレスも更新されます。

**動作**:
1. kintoneのレコードID（`$id`）で既存ユーザーを検索
2. 見つかった場合、メールアドレスが変更されていれば更新
3. 見つからない場合、新規ユーザーとして作成

**注意事項**:
- メールアドレス更新時、ユーザーIDは変更されません（同じアカウントとして扱われます）
- 過去のデータ（クイズ結果など）との紐付けは維持されます

### 処理の流れ（1時間ごとの自動実行）

1時間ごとの自動実行では、以下の処理が実行されます：

#### 1. 新規ユーザーの作成・更新処理

**処理対象の判定**:
- kintoneから全レコードを取得（条件に一致するもののみ）
- 各レコードについて以下を判定：
  1. **kintoneレコードIDで既存ユーザーを検索**
     - 見つかった場合：
       - メールアドレスが変更されていれば**更新**
       - メールアドレスが同じなら**スキップ**
     - 見つからない場合：
       - メールアドレスで既存ユーザーを検索
       - 見つかった場合：**スキップ**（レコードIDなしの既存ユーザー）
       - 見つからない場合：**新規作成**

**処理件数の制限**:
- 1回の実行で最大**50バッチ**（50 × 100 = **5,000件**）まで処理
- バッチサイズは100件
- 全件処理モード（`processAll: true`）で実行

#### 2. 削除処理

**削除対象の判定**:
- kintoneから全レコードを取得（条件に一致するもののみ）
- Supabaseの全ユーザーと比較：
  1. **kintoneレコードIDで確認**
     - Supabaseユーザーの`user_metadata.kintone_record_id`がkintoneに存在する場合：**削除しない**（メールアドレス変更の可能性があるため）
  2. **メールアドレスで確認**
     - kintoneに存在しないメールアドレスのユーザー：**削除対象**

**未処理レコードの判別方法**:

現在の実装では、**未処理レコードを明示的に判別していません**。以下の方法で処理されます：

1. **kintoneから全レコードを取得**
   - 条件に一致するレコードをすべて取得
   - ページネーションで全件取得（`getAllKintoneRecords`）

2. **既存ユーザーとの照合**
   - kintoneレコードIDで既存ユーザーを検索
   - 見つからない場合、メールアドレスで検索
   - どちらでも見つからない場合：**新規作成**として処理

3. **処理の継続性**
   - 全件処理モード（`processAll: true`）で実行されるため、すべてのレコードが処理される
   - 最大50バッチ（5,000件）まで処理可能
   - それ以上ある場合は、次回の実行で続きから処理される

**注意事項**:
- 未処理レコードを明示的に追跡する機能は現在実装されていません
- すべてのレコードを毎回チェックするため、処理時間がかかる可能性があります
- 大量のレコードがある場合、タイムアウト（10分）に注意が必要です

### kintone Webhook連携

kintoneのWebhook設定で、以下のURLを指定：

```
https://your-domain.com/api/sync-kintone-users
```

リクエストボディ例：
```json
{
  "singleUser": "{{レコード.メールアドレス.value}}"
}
```

### 定期自動実行（GitHub Actions）

GitHub Actionsを使用して定期実行を設定します（推奨）。

#### 実行スケジュール

- デフォルト: 毎時0分（UTC時間）= 日本時間毎時9分
- 設定ファイル: `.github/workflows/sync-kintone-users.yml`

#### スケジュールの変更

`.github/workflows/sync-kintone-users.yml`の`cron`を変更してください：

```yaml
schedule:
  - cron: '0 * * * *'  # 毎時0分（UTC）
```

Cron形式の例：
- `0 * * * *` - 毎時0分（UTC）= 日本時間毎時9分
- `0 */6 * * *` - 6時間ごと
- `0 2 * * *` - 毎日午前2時（UTC）= 日本時間午前11時
- `0 0 * * 0` - 毎週日曜日午前0時

#### セットアップ

1. GitHubリポジトリのSettings → Secrets and variables → Actions
2. 以下のシークレットを追加（オプション）：
   - `API_URL`: アプリのURL（例: `https://your-domain.com`）
     - 未設定の場合は、`.github/workflows/sync-kintone-users.yml`内のデフォルト値が使用されます

#### 手動実行

GitHub Actionsの画面から手動実行も可能です。以下の手順で実行できます：

**手順**:

1. **GitHubリポジトリを開く**
   - GitHubでリポジトリのページを開きます

2. **「Actions」タブをクリック**
   - リポジトリの上部にあるタブから「Actions」を選択します

3. **左側のサイドバーからワークフローを選択**
   - **重要**: 左側のサイドバーで「Sync kintone users to Supabase」をクリックします
   - 「All workflows」の画面では「Run workflow」ボタンは表示されません
   - 特定のワークフローの詳細ページに移動する必要があります

4. **「Run workflow」ボタンを確認**
   - ワークフローの詳細ページに移動すると、画面右上に「Run workflow」ボタンが表示されます
   - このボタンが表示されない場合：
     - 左側のサイドバーで「Sync kintone users to Supabase」をクリックしているか確認
     - ブラウザをリロードしてみる
     - `main`ブランチに`.github/workflows/sync-kintone-users.yml`ファイルが存在するか確認

5. **「Run workflow」ボタンをクリック**
   - 画面右上にある「Run workflow」ボタンをクリックします
   - ドロップダウンメニューが表示されます

6. **ブランチを選択**
   - 「Use workflow from」でブランチを選択します（通常は`main`または`master`）
   - デフォルトでは最新のブランチが選択されています

7. **「Run workflow」をクリック**
   - ドロップダウンメニューの下部にある「Run workflow」ボタンをクリックします

8. **実行状況を確認**
   - 実行が開始されると、ワークフロー一覧に新しい実行が表示されます
   - 実行中の場合は黄色の丸（⏸️）が表示されます
   - 完了すると緑色のチェックマーク（✅）または赤色のX（❌）が表示されます

9. **ログを確認**
   - 実行をクリックすると、詳細なログを確認できます
   - 「Sync users from kintone to Supabase」ステップを展開して、処理結果を確認します

**「Run workflow」ボタンが表示されない場合の対処法**:

1. **左側のサイドバーからワークフローを選択**
   - 「All workflows」ではなく、「Sync kintone users to Supabase」をクリック
   - これにより、ワークフローの詳細ページに移動します

2. **ブランチを確認**
   - `.github/workflows/sync-kintone-users.yml`ファイルが`main`ブランチに存在するか確認
   - 他のブランチにのみ存在する場合、そのブランチに切り替える必要があります

3. **権限を確認**
   - リポジトリへの書き込み権限があるか確認
   - 権限がない場合、「Run workflow」ボタンが表示されないことがあります

**注意事項**:
- 手動実行は、スケジュール実行と同じ処理を実行します
- 実行には数秒から数分かかる場合があります
- エラーが発生した場合は、ログを確認して原因を特定してください

#### ログの確認

GitHub Actionsのログで実行結果を確認できます：
- 処理件数
- 作成件数
- スキップ件数
- 失敗件数

**画面の見方**:
- **ワークフロー**: 左側のサイドバーに表示される「Sync kintone users to Supabase」は、ワークフロー定義（1つだけ）です
- **実行履歴**: メイン画面に表示されるリストは、そのワークフローの実行履歴（実行ログ）です
  - スケジュール実行、手動実行、プッシュなどのイベントで実行されるたびに、新しい実行履歴が追加されます
  - 各実行には「#9: Scheduled」「#8: Scheduled」などの番号と実行理由が表示されます
  - ✅ 緑色のチェックマーク: 成功
  - ❌ 赤色のX: 失敗
  - ⏸️ 黄色の丸: 実行中または待機中

#### 注意事項

1時間に1回の実行頻度の場合：

- **API呼び出し制限**: kintone APIとSupabase APIのレート制限を確認してください
- **重複処理**: 既存ユーザーは自動的にスキップされます
- **処理時間**: バッチサイズを調整して、10分以内に完了するように設定してください
- **エラーハンドリング**: エラーが発生した場合は、GitHub Actionsのログで確認できます

## Supabaseメール設定

### パスワード変更メールの差出人名を変更する

Supabase Authから送信されるパスワード変更メールの差出人名（現在は「Supabase Auth」）を変更するには、カスタムSMTPプロバイダーを設定する必要があります。

#### 設定手順

1. **Supabaseダッシュボードにログイン**
   - [https://supabase.com](https://supabase.com) にアクセス
   - プロジェクトを選択

2. **Authentication設定を開く**
   - 左側のメニューから「Authentication」を選択
   - 「Settings」タブを開く

3. **SMTP Settingsを設定**
   - 「SMTP Settings」セクションまでスクロール
   - 以下の情報を入力：
     - **SMTP Host**: SMTPサーバーのホスト名（例: `smtp.resend.com`, `smtp.sendgrid.net`）
     - **SMTP Port**: SMTPサーバーのポート番号（通常は`587`または`465`）
     - **SMTP User**: SMTPサーバーのユーザー名
     - **SMTP Pass**: SMTPサーバーのパスワード
     - **Sender Name**: 差出人名（例: `TCJ日本語学校`, `試験対策システム`）
     - **Sender Email**: 送信元のメールアドレス（例: `noreply@your-domain.com`）
   - 「Save」をクリック

4. **メールテンプレートのカスタマイズ（オプション）**
   - 「Templates」タブを開く
   - 「Reset Password」テンプレートを選択
   - メールの内容やデザインをカスタマイズ
   - 「Save」をクリック

#### SMTPプロバイダーの選定

**Google Workspaceを使用している場合（推奨）**:
- **Gmail SMTP**: 自社ドメインからのメール送信が可能
- 追加のサービス契約不要
- 設定が簡単
- 詳細な設定方法は下記を参照

その他のSMTPサービス：
- **Resend**: 開発者向け、無料プランあり
- **SendGrid**: 大手サービス、無料プランあり
- **Amazon SES**: AWS利用者向け、低コスト
- **Mailgun**: 開発者向け、無料プランあり

#### ⚠️ Google Workspace（Gmail SMTP）についての重要な注意

**2025年3月14日以降、Gmail/Google Workspaceでは基本認証（ユーザー名とパスワード）によるSMTP接続が無効化されました。**

以前の方法（アプリパスワードを使用したSMTP設定）は、現在では**動作しない可能性が高い**です。Google WorkspaceではOAuth 2.0認証が必須となりましたが、SupabaseのSMTP設定ではOAuth 2.0を直接使用できません。

**推奨される代替手段:**

以下の外部メール送信サービスを使用することをお勧めします：

1. **Resend**（推奨）
   - 開発者向け、無料プランあり（月3,000通まで）
   - Supabaseとの統合が容易
   - 設定方法は下記参照

2. **SendGrid**
   - 大手サービス、無料プランあり（月100通まで）
   - 信頼性が高い

3. **Amazon SES**
   - AWS利用者向け、低コスト
   - 大量送信に適している

#### Resendを使用する場合の設定方法（推奨）

**1. Resendでの準備**

1. [Resend](https://resend.com)にサインアップ
2. ダッシュボードで「Domains」を選択
3. 独自ドメインを追加（例: `your-domain.com`）
4. DNS設定を完了（Resendが提供するDNSレコードをドメインに追加）
5. ドメインの検証が完了するまで待機（通常数分〜数時間）

**2. Resend APIキーの取得**

1. Resendダッシュボードで「API Keys」を選択
2. 「Create API Key」をクリック
3. 名前を入力（例: `Supabase Auth`）
4. 権限を選択（「Sending access」を選択）
5. APIキーをコピー（一度しか表示されません）

**3. SupabaseでのSMTP設定**

Supabaseダッシュボードで以下の設定を行います：

- **SMTP Host**: `smtp.resend.com`
- **SMTP Port**: `465`（SSL）または`587`（TLS）
- **SMTP User**: `resend`
- **SMTP Pass**: 上記で作成したResend APIキー
- **Sender Name**: 差出人名（例: `TCJ日本語学校`, `試験対策システム`）
- **Sender Email**: Resendで検証済みのドメインのメールアドレス（例: `noreply@your-domain.com`）

**4. 注意事項**

- 送信元メールアドレスは、Resendで検証済みのドメインのアドレスを使用してください
- 無料プランでは月3,000通まで送信可能
- 大量送信が必要な場合は、有料プランを検討してください

#### 注意事項

- カスタムSMTPを設定しない場合、デフォルトの「Supabase Auth」が差出人名として使用されます
- SMTP設定後、メール送信が正常に動作するかテストしてください
- 送信元メールアドレスは、SMTPプロバイダーで認証済みのアドレスを使用してください

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

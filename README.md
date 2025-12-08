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

5. **環境変数の反映**
   - 環境変数を追加・変更した後は、**再デプロイが必要**です
   - 「Deployments」タブから最新のデプロイを選択
   - 「Redeploy」ボタンをクリックして再デプロイ

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
  "skipped": 5,
  "failed": 0,
  "hasMore": true,
  "nextOffset": 100,
  "message": "処理完了: 作成 95件, スキップ 5件, 失敗 0件",
  "errors": []
}
```

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

GitHub Actionsの画面から手動実行も可能です：
1. GitHubリポジトリの「Actions」タブを開く
2. 「Sync kintone users to Supabase」ワークフローを選択
3. 「Run workflow」ボタンをクリック

#### ログの確認

GitHub Actionsのログで実行結果を確認できます：
- 処理件数
- 作成件数
- スキップ件数
- 失敗件数

#### 注意事項

1時間に1回の実行頻度の場合：

- **API呼び出し制限**: kintone APIとSupabase APIのレート制限を確認してください
- **重複処理**: 既存ユーザーは自動的にスキップされます
- **処理時間**: バッチサイズを調整して、10分以内に完了するように設定してください
- **エラーハンドリング**: エラーが発生した場合は、GitHub Actionsのログで確認できます

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

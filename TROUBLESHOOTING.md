# トラブルシューティングガイド

## Supabaseにアカウントが追加されない場合の確認方法

### 1. GitHub Actionsの実行状況を確認

1. GitHubリポジトリの「Actions」タブを開く
2. 「Sync kintone users to Supabase」ワークフローを選択
3. 最新の実行履歴を確認
   - ✅ 緑色のチェックマーク: 正常に実行された
   - ❌ 赤色のX: エラーが発生した
   - ⏸️ 黄色の丸: 実行中または待機中

### 2. 実行ログを確認

GitHub Actionsの実行ログで以下を確認：

- **HTTPステータス**: 200であること
- **処理結果**: `created`（作成件数）が0より大きいこと
- **エラーメッセージ**: エラーが発生している場合は詳細を確認

#### よくあるエラー

**`API_URLがデフォルト値です`**
- 原因: GitHub Secretsに`API_URL`が設定されていない
- 解決方法: 
  1. GitHubリポジトリの「Settings」→「Secrets and variables」→「Actions」
  2. 「New repository secret」をクリック
  3. Name: `API_URL`, Value: アプリのURL（例: `https://your-domain.com`）
  4. 「Add secret」をクリック

**`Supabase Adminクライアントが初期化されていません`**
- 原因: Vercelの環境変数が設定されていない、または再デプロイされていない
- 解決方法: 
  1. Vercelダッシュボードで環境変数を設定
  2. **重要**: 環境変数を設定した後は、必ず再デプロイが必要です
  3. 必要な環境変数:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `KINTONE_SUBDOMAIN`
     - `KINTONE_API_TOKEN`
     - `KINTONE_APP_ID`

**`kintone環境変数が設定されていません`**
- 原因: 本番環境の環境変数が設定されていない
- 解決方法: Vercelやデプロイ先の環境変数を確認

**`kintone API エラー: 400`**
- 原因: kintone APIの接続エラー
- 解決方法: 
  - kintoneのAPIトークンが正しいか確認
  - アプリIDが正しいか確認
  - サブドメインが正しいか確認

### 3. 手動でテスト実行

#### 方法1: GitHub Actionsから手動実行

1. GitHubリポジトリの「Actions」タブを開く
2. 「Sync kintone users to Supabase」ワークフローを選択
3. 右側の「Run workflow」ボタンをクリック
4. 「Run workflow」をクリック

#### 方法2: APIエンドポイントを直接呼び出し

```bash
curl -X POST https://your-domain.com/api/sync-kintone-users \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 100,
    "offset": 0,
    "emailFieldCode": "email",
    "query": "",
    "processAll": true,
    "maxBatches": 50,
    "deleteOrphanedUsers": true
  }'
```

#### 方法3: ブラウザからテスト

`public/test-sync.html`を開いて、ブラウザからテストできます。

### 4. kintoneのレコードを確認

以下の条件を満たすレコードが存在するか確認：

- `permissionGroup`テーブル型フィールドが存在する
- `permissionGroup`内の`groupName`フィールドに以下のいずれかが含まれている：
  - `試験対策集中講座（養成）`
  - `合格パック単体（養成）`
- `email`フィールドに有効なメールアドレスが設定されている

### 5. Supabaseのユーザーを確認

1. Supabaseダッシュボードを開く
2. 「Authentication」→「Users」を開く
3. ユーザーが作成されているか確認

### 6. ログを確認

#### 本番環境のログ

- Vercelの場合: Vercelダッシュボードの「Functions」タブでログを確認
- その他の場合: デプロイ先のログ機能を使用

#### ログに出力される情報

- 開始時刻
- リクエストパラメータ
- フィルタリング結果（条件に一致したレコード数）
- 処理結果（作成、スキップ、失敗件数）
- エラー詳細（エラーが発生した場合）

### 7. よくある問題と解決方法

#### 問題: 条件に一致するレコードがない

**症状**: `processed: 0` または `条件に一致するレコードがありません`

**確認方法**:
```bash
# kintone接続テスト
curl https://your-domain.com/api/sync-kintone-users?test=kintone
```

**解決方法**:
- kintoneのレコードを確認
- `permissionGroup`の構造が正しいか確認
- `groupName`の値が完全一致しているか確認（スペースや全角/半角に注意）

#### 問題: 既にユーザーが存在するためスキップされる

**症状**: `created: 0, skipped: X`

**確認方法**: Supabaseのユーザー一覧で既にユーザーが存在するか確認

**解決方法**: これは正常な動作です。既存ユーザーはスキップされます。

#### 問題: 通常モードで1バッチしか処理されない

**症状**: `hasMore: true` だが処理が止まる

**解決方法**: GitHub Actionsのワークフローで`processAll: true`を設定（既に設定済み）

### 8. デバッグ用エンドポイント

#### kintone接続テスト

```bash
GET https://your-domain.com/api/sync-kintone-users?test=kintone
```

#### 通常の同期処理

```bash
POST https://your-domain.com/api/sync-kintone-users
Content-Type: application/json

{
  "batchSize": 100,
  "offset": 0,
  "emailFieldCode": "email",
  "query": "",
  "processAll": true,
  "maxBatches": 50,
  "deleteOrphanedUsers": true
}
```

### 9. 環境変数の確認

以下の環境変数が正しく設定されているか確認：

- `KINTONE_SUBDOMAIN`: kintoneのサブドメイン
- `KINTONE_API_TOKEN`: kintoneのAPIトークン
- `KINTONE_APP_ID`: kintoneのアプリID
- `NEXT_PUBLIC_SUPABASE_URL`: SupabaseのURL
- `SUPABASE_SERVICE_ROLE_KEY`: SupabaseのService Role Key

#### Vercelでの環境変数設定方法

1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. 「Settings」→「Environment Variables」を開く
4. 上記の環境変数を追加
5. **重要**: 環境変数を追加・変更した後は、再デプロイが必要です

詳細は`README.md`の「Vercel（本番環境）での設定方法」を参照してください。

### 10. サポートが必要な場合

以下の情報を準備してサポートに連絡：

1. GitHub Actionsの実行ログ（スクリーンショット）
2. APIエンドポイントのレスポンス（JSON）
3. kintoneのレコード例（個人情報を除く）
4. エラーメッセージの全文
5. 実行時刻（UTCと日本時間）


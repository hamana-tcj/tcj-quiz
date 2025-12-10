/**
 * CSVファイルからユーザーを一括登録するAPI
 * 
 * POST /api/import-users-csv
 * 
 * リクエスト:
 * - Content-Type: multipart/form-data
 * - file: CSVファイル
 * 
 * CSV形式:
 * email,kintone_record_id
 * user1@example.com,123
 * user2@example.com,456
 * 
 * または
 * 
 * email
 * user1@example.com
 * user2@example.com
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "total": 100,
 *   "created": 95,
 *   "skipped": 5,
 *   "failed": 0,
 *   "errors": []
 * }
 */

import { createUsersBatch, userExists } from '@/lib/supabaseAdmin';
import { isValidEmail } from '@/lib/kintoneClient';

export async function POST(request) {
  const startTime = Date.now();
  console.log('=== CSV一括登録処理開始 ===');
  console.log('開始時刻:', new Date().toISOString());

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return Response.json(
        { success: false, error: 'CSVファイルがアップロードされていません' },
        { status: 400 }
      );
    }

    // CSVファイルを読み込む
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');

    if (lines.length < 2) {
      return Response.json(
        { success: false, error: 'CSVファイルが空か、ヘッダー行のみです' },
        { status: 400 }
      );
    }

    // ヘッダー行を解析
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const emailIndex = header.indexOf('email');
    
    if (emailIndex === -1) {
      return Response.json(
        { success: false, error: 'CSVファイルに"email"列が見つかりません' },
        { status: 400 }
      );
    }

    const kintoneRecordIdIndex = header.indexOf('kintone_record_id') !== -1 
      ? header.indexOf('kintone_record_id')
      : header.indexOf('kintone_recordid') !== -1
      ? header.indexOf('kintone_recordid')
      : header.indexOf('record_id') !== -1
      ? header.indexOf('record_id')
      : -1;

    console.log(`CSV解析: ヘッダー=${header.join(', ')}, 総行数=${lines.length - 1}件`);

    // データ行を解析
    const recordsToCreate = [];
    const existingEmails = [];
    const invalidEmails = [];
    let processedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',').map(col => col.trim());
      const email = columns[emailIndex]?.toLowerCase().trim();
      const kintoneRecordId = kintoneRecordIdIndex !== -1 
        ? columns[kintoneRecordIdIndex]?.trim() || null
        : null;

      if (!email) {
        invalidEmails.push({ line: i + 1, reason: 'メールアドレスが空です' });
        continue;
      }

      if (!isValidEmail(email)) {
        invalidEmails.push({ line: i + 1, email, reason: '無効なメールアドレス形式です' });
        continue;
      }

      processedCount++;

      // 既存ユーザーチェック
      try {
        const exists = await userExists(email);
        if (exists) {
          existingEmails.push({ email, kintoneRecordId, line: i + 1 });
          continue;
        }

        recordsToCreate.push({ email, kintoneRecordId });
      } catch (error) {
        console.error(`ユーザー存在チェックエラー (${email}):`, error);
        existingEmails.push({ email, kintoneRecordId, line: i + 1, reason: 'チェックエラー' });
      }
    }

    console.log(`CSV解析完了: 処理対象=${processedCount}件, 新規作成予定=${recordsToCreate.length}件, 既存=${existingEmails.length}件, 無効=${invalidEmails.length}件`);

    // 新規ユーザーを作成
    let createResults = { success: [], skipped: [], failed: [] };
    if (recordsToCreate.length > 0) {
      console.log(`ユーザー作成開始: ${recordsToCreate.length}件`);
      createResults = await createUsersBatch(recordsToCreate);
      console.log(`ユーザー作成完了: 成功=${createResults.success.length}件, スキップ=${createResults.skipped.length}件, 失敗=${createResults.failed.length}件`);
    }

    // 既存ユーザーエラーをスキップとして扱う
    const actualFailed = createResults.failed.filter(f => {
      return !f.error || (
        !f.error.includes('already been registered') &&
        !f.error.includes('already exists') &&
        !f.error.includes('User already registered')
      );
    });
    const skippedFromFailed = createResults.failed.filter(f => {
      return f.error && (
        f.error.includes('already been registered') ||
        f.error.includes('already exists') ||
        f.error.includes('User already registered')
      );
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const result = {
      success: true,
      total: processedCount,
      created: createResults.success.length,
      skipped: existingEmails.length + createResults.skipped.length + skippedFromFailed.length,
      failed: actualFailed.length + invalidEmails.length,
      errors: [
        ...actualFailed.map(f => ({ email: f.email, error: f.error })),
        ...invalidEmails.map(e => ({ line: e.line, email: e.email, error: e.reason })),
      ],
      details: {
        processed: processedCount,
        created: createResults.success.length,
        skipped: existingEmails.length + createResults.skipped.length + skippedFromFailed.length,
        failed: actualFailed.length + invalidEmails.length,
        existingEmails: existingEmails.slice(0, 10), // 最初の10件のみ表示
        invalidEmails: invalidEmails.slice(0, 10), // 最初の10件のみ表示
      },
      duration: `${duration}秒`,
    };

    console.log(`=== CSV一括登録処理完了（処理時間: ${duration}秒） ===`);
    console.log(`結果: 作成=${result.created}件, スキップ=${result.skipped}件, 失敗=${result.failed}件`);

    return Response.json(result);
  } catch (error) {
    console.error('CSV一括登録エラー:', error);
    return Response.json(
      {
        success: false,
        error: error.message || 'CSV一括登録中にエラーが発生しました',
      },
      { status: 500 }
    );
  }
}


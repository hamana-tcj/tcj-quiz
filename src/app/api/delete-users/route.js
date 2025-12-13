/**
 * CSVファイルからユーザーを一括削除するAPI
 * 
 * POST /api/delete-users-csv
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
 * レスポンス:
 * {
 *   "success": true,
 *   "total": 100,
 *   "deleted": 95,
 *   "skipped": 5,
 *   "failed": 0,
 *   "errors": []
 * }
 */

import { deleteUser } from '@/lib/supabaseAdmin';
import { isValidEmail } from '@/lib/kintoneClient';

export async function POST(request) {
  const startTime = Date.now();
  console.log('=== CSV一括削除処理開始 ===');
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

    if (kintoneRecordIdIndex === -1) {
      return Response.json(
        { success: false, error: 'CSVファイルに"kintone_record_id"列が見つかりません。削除にはメールアドレスとkintoneレコードIDの両方が必要です。' },
        { status: 400 }
      );
    }

    console.log(`CSV解析: ヘッダー=${header.join(', ')}, 総行数=${lines.length - 1}件`);

    // データ行を解析
    const recordsToDelete = [];
    const skippedRecords = [];
    const invalidEmails = [];
    let processedCount = 0;

    // 最適化: 全ユーザーを一度に取得してメモリ上で検索
    console.log('[最適化] 全ユーザーを一度に取得してメモリ上で検索します...');
    const allSupabaseUsers = [];
    let page = 1;
    const perPage = 1000;
    let hasMore = true;
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
    
    while (hasMore && page <= 10) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: page,
        perPage: perPage,
      });
      
      if (error) {
        console.error(`[最適化] ユーザー取得エラー (ページ${page}):`, error);
        break;
      }
      
      if (!data || !data.users || data.users.length === 0) {
        hasMore = false;
        break;
      }
      
      allSupabaseUsers.push(...data.users);
      hasMore = data.users.length === perPage;
      page++;
    }
    
    console.log(`[最適化] 全ユーザー取得完了: ${allSupabaseUsers.length}件`);
    
    // メモリ上で検索用のマップを作成
    const usersByKintoneRecordId = new Map();
    const usersByEmail = new Map();
    
    for (const user of allSupabaseUsers) {
      const kintoneRecordId = user.user_metadata?.kintone_record_id;
      if (kintoneRecordId) {
        usersByKintoneRecordId.set(String(kintoneRecordId), user);
      }
      if (user.email) {
        usersByEmail.set(user.email.toLowerCase().trim(), user);
      }
    }
    
    console.log(`[最適化] 検索マップ作成完了: kintoneRecordId=${usersByKintoneRecordId.size}件, email=${usersByEmail.size}件`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',').map(col => col.trim());
      const email = columns[emailIndex]?.toLowerCase().trim();
      let kintoneRecordId = columns[kintoneRecordIdIndex]?.trim() || null;
      
      // kintoneRecordIdの検証（空文字列、null、undefined、無効な値を除外）
      if (kintoneRecordId) {
        const kintoneRecordIdLower = kintoneRecordId.toLowerCase();
        if (kintoneRecordIdLower === 'null' || kintoneRecordIdLower === 'undefined' || kintoneRecordId === '') {
          kintoneRecordId = null;
        }
      }

      if (!email) {
        invalidEmails.push({ line: i + 1, reason: 'メールアドレスが空です' });
        continue;
      }

      if (!isValidEmail(email)) {
        invalidEmails.push({ line: i + 1, email, reason: '無効なメールアドレス形式です' });
        continue;
      }

      if (!kintoneRecordId) {
        invalidEmails.push({ line: i + 1, email, reason: 'kintone_record_idが必要です' });
        continue;
      }

      processedCount++;

      // メールアドレスとkintoneレコードIDの両方が一致するユーザーを検索
      const kintoneRecordIdStr = String(kintoneRecordId);
      const existingUserByKintoneId = usersByKintoneRecordId.get(kintoneRecordIdStr);
      const existingUserByEmail = usersByEmail.get(email);

      // 両方が一致する場合のみ削除対象
      if (existingUserByKintoneId && existingUserByEmail && 
          existingUserByKintoneId.id === existingUserByEmail.id) {
        console.log(`[削除対象] email=${email}, kintoneRecordId=${kintoneRecordIdStr}, userId=${existingUserByKintoneId.id}`);
        recordsToDelete.push({ email, kintoneRecordId: kintoneRecordIdStr, userId: existingUserByKintoneId.id });
      } else {
        console.log(`[削除対象外] email=${email}, kintoneRecordId=${kintoneRecordIdStr} - 一致するユーザーが見つかりません`);
        skippedRecords.push({ email, kintoneRecordId, line: i + 1, reason: '一致するユーザーが見つかりません' });
      }
    }

    console.log(`CSV解析完了: 処理対象=${processedCount}件, 削除予定=${recordsToDelete.length}件, スキップ=${skippedRecords.length}件, 無効=${invalidEmails.length}件`);

    // 削除処理を実行
    let deletedCount = 0;
    const deleteResults = {
      success: [],
      failed: [],
    };

    if (recordsToDelete.length > 0) {
      console.log(`ユーザー削除開始: ${recordsToDelete.length}件`);

      for (const record of recordsToDelete) {
        try {
          await deleteUser(record.userId);
          deletedCount++;
          deleteResults.success.push({ email: record.email, kintoneRecordId: record.kintoneRecordId });
          console.log(`✅ ユーザー削除成功: email=${record.email}, kintoneRecordId=${record.kintoneRecordId}`);
        } catch (deleteError) {
          console.error(`❌ ユーザー削除エラー (${record.email}):`, deleteError);
          deleteResults.failed.push({ 
            email: record.email, 
            kintoneRecordId: record.kintoneRecordId, 
            error: deleteError.message 
          });
        }
      }

      console.log(`ユーザー削除完了: 成功=${deleteResults.success.length}件, 失敗=${deleteResults.failed.length}件`);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const result = {
      success: true,
      total: processedCount,
      deleted: deletedCount,
      skipped: skippedRecords.length,
      failed: deleteResults.failed.length + invalidEmails.length,
      errors: [
        ...deleteResults.failed.map(f => ({ email: f.email, error: f.error })),
        ...invalidEmails.map(e => ({ line: e.line, email: e.email, error: e.reason })),
      ],
      details: {
        processed: processedCount,
        deleted: deletedCount,
        skipped: skippedRecords.length,
        failed: deleteResults.failed.length + invalidEmails.length,
        deleteResults: deleteResults.success.slice(0, 10), // 最初の10件のみ表示
        skippedRecords: skippedRecords.slice(0, 10), // 最初の10件のみ表示
        invalidEmails: invalidEmails.slice(0, 10), // 最初の10件のみ表示
      },
      duration: `${duration}秒`,
    };

    console.log(`=== CSV一括削除処理完了（処理時間: ${duration}秒） ===`);
    console.log(`結果: 削除=${result.deleted}件, スキップ=${result.skipped}件, 失敗=${result.failed}件`);

    return Response.json(result);
  } catch (error) {
    console.error('CSV一括削除エラー:', error);
    console.error('エラースタック:', error.stack);
    
    // エラー時も必ずJSONレスポンスを返す
    const errorResponse = {
      success: false,
      error: error.message || 'CSV一括削除中にエラーが発生しました',
      errorType: error.name || 'UnknownError',
    };
    
    return Response.json(errorResponse, { status: 500 });
  }
}


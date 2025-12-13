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

import { createUsersBatch, userExists, getUserByKintoneRecordId, updateUserEmail, updateUserMetadata, deleteUser } from '@/lib/supabaseAdmin';
import { isValidEmail } from '@/lib/kintoneClient';

export async function POST(request) {
  const startTime = Date.now();
  console.log('=== CSV一括登録処理開始 ===');
  console.log('開始時刻:', new Date().toISOString());

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const deleteMode = formData.get('deleteMode') === 'true'; // 削除モード

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

    console.log(`CSV解析: ヘッダー=${header.join(', ')}, 総行数=${lines.length - 1}件, 削除モード=${deleteMode}`);

    // データ行を解析
    const recordsToCreate = [];
    const existingEmails = [];
    const invalidEmails = [];
    const recordsToDelete = []; // 削除対象
    let processedCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;

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
      let kintoneRecordId = kintoneRecordIdIndex !== -1 
        ? columns[kintoneRecordIdIndex]?.trim() || null
        : null;
      
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

      processedCount++;

      // 削除モードの場合
      if (deleteMode) {
        if (!kintoneRecordId) {
          invalidEmails.push({ line: i + 1, email, reason: '削除モードではkintone_record_idが必要です' });
          continue;
        }

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
          existingEmails.push({ email, kintoneRecordId, line: i + 1, action: 'skipped', reason: '一致するユーザーが見つかりません' });
        }
        continue;
      }

      // 既存ユーザーチェック（通常モード）
      try {
        // まずkintoneレコードIDで既存ユーザーを検索（メモリ上で検索）
        let existingUser = null;
        if (kintoneRecordId) {
          const kintoneRecordIdStr = String(kintoneRecordId);
          existingUser = usersByKintoneRecordId.get(kintoneRecordIdStr);
          
          if (existingUser) {
            console.log(`[既存ユーザー発見] kintoneレコードID=${kintoneRecordIdStr}, CSV email=${email}, 既存email=${existingUser.email}, Supabase ID=${existingUser.id}`);
            
            // メールアドレスを正規化して比較
            const existingEmailNormalized = existingUser.email?.toLowerCase().trim();
            const csvEmailNormalized = email.toLowerCase().trim();
            
            console.log(`[メールアドレス比較] 既存=${existingEmailNormalized}, CSV=${csvEmailNormalized}, 一致=${existingEmailNormalized === csvEmailNormalized}`);
            
            if (existingEmailNormalized !== csvEmailNormalized) {
              // メールアドレスが変更されている場合は更新
              try {
                console.log(`[メールアドレス更新開始] ${existingUser.email} → ${email} (レコードID: ${kintoneRecordIdStr})`);
                await updateUserEmail(existingUser.id, email);
                updatedCount++;
                console.log(`✅ メールアドレス更新成功: ${existingUser.email} → ${email}`);
                existingEmails.push({ email, kintoneRecordId, line: i + 1, action: 'updated' });
              } catch (updateError) {
                console.error(`❌ メールアドレス更新エラー (${email}):`, updateError);
                console.error(`エラースタック:`, updateError.stack);
                existingEmails.push({ email, kintoneRecordId, line: i + 1, reason: '更新エラー', error: updateError.message });
              }
            } else {
              // メールアドレスが同じ場合はスキップ
              console.log(`[スキップ] メールアドレスが同じためスキップ: ${email}`);
              existingEmails.push({ email, kintoneRecordId, line: i + 1, action: 'skipped' });
            }
            continue;
          } else {
            // kintoneレコードIDで見つからない場合のログ（デバッグ用）
            if (i < 5) { // 最初の5件のみログ出力
              console.log(`[デバッグ] kintoneレコードID=${kintoneRecordIdStr}で既存ユーザーが見つかりませんでした`);
            }
          }
        }

        // kintoneレコードIDで見つからない場合、メールアドレスで検索（メモリ上で検索）
        const existingUserByEmail = usersByEmail.get(email);
        if (existingUserByEmail) {
          console.log(`[既存ユーザー発見] email=${email} (メールアドレスで検出)`);
          
          // 既存ユーザーのkintoneレコードIDを確認
          const currentRecordId = existingUserByEmail.user_metadata?.kintone_record_id;
          
          // CSVにkintoneレコードIDが含まれている場合
          if (kintoneRecordId) {
            if (!currentRecordId) {
              // 既存ユーザーにkintoneレコードIDがない場合、追加
              try {
                console.log(`[メタデータ更新] 既存ユーザーにkintoneレコードIDを追加: email=${email}, recordId=${kintoneRecordId}`);
                await updateUserMetadata(existingUserByEmail.id, kintoneRecordId);
                updatedCount++;
                console.log(`✅ kintoneレコードID追加成功: email=${email}, recordId=${kintoneRecordId}`);
              } catch (updateError) {
                console.error(`❌ kintoneレコードID追加エラー (${email}):`, updateError);
              }
            } else if (currentRecordId === String(kintoneRecordId)) {
              // kintoneレコードIDが一致する場合、メールアドレスが異なれば更新
              // ただし、このケースでは既にメールアドレスで検索しているので、メールアドレスは同じはず
              // 念のため確認
              const existingEmailNormalized = existingUserByEmail.email?.toLowerCase().trim();
              if (existingEmailNormalized !== email) {
                // メールアドレスが異なる場合（通常は発生しないが、念のため）
                try {
                  console.log(`[メールアドレス更新] ${existingUserByEmail.email} → ${email} (レコードID: ${kintoneRecordId})`);
                  await updateUserEmail(existingUserByEmail.id, email);
                  updatedCount++;
                  console.log(`✅ メールアドレス更新成功: ${existingUserByEmail.email} → ${email}`);
                  existingEmails.push({ email, kintoneRecordId, line: i + 1, action: 'updated' });
                } catch (updateError) {
                  console.error(`❌ メールアドレス更新エラー (${email}):`, updateError);
                  existingEmails.push({ email, kintoneRecordId, line: i + 1, reason: '更新エラー', error: updateError.message });
                }
              } else {
                // メールアドレスが同じ場合はスキップ
                existingEmails.push({ email, kintoneRecordId, line: i + 1, action: 'skipped' });
              }
            } else {
              // kintoneレコードIDが異なる場合（別のユーザーの可能性）
              console.log(`[警告] kintoneレコードIDが異なります: email=${email}, 既存ID=${currentRecordId}, CSV ID=${kintoneRecordId}`);
              existingEmails.push({ email, kintoneRecordId, line: i + 1, action: 'skipped', reason: 'kintoneレコードIDが異なります' });
            }
          } else {
            // CSVにkintoneレコードIDが含まれていない場合、スキップ
            existingEmails.push({ email, kintoneRecordId, line: i + 1, action: 'skipped' });
          }
          continue;
        }

        // 新規ユーザーとして作成
        console.log(`[新規ユーザー作成予定] email=${email}, recordId=${kintoneRecordId || 'なし'}`);
        recordsToCreate.push({ email, kintoneRecordId });
      } catch (error) {
        console.error(`ユーザー存在チェックエラー (${email}):`, error);
        existingEmails.push({ email, kintoneRecordId, line: i + 1, reason: 'チェックエラー', error: error.message });
      }
    }

    console.log(`CSV解析完了: 処理対象=${processedCount}件, 新規作成予定=${recordsToCreate.length}件, 既存=${existingEmails.length}件, 更新=${updatedCount}件, 削除予定=${recordsToDelete.length}件, 無効=${invalidEmails.length}件`);

    // 削除モードの場合、削除処理を実行
    if (deleteMode && recordsToDelete.length > 0) {
      console.log(`ユーザー削除開始: ${recordsToDelete.length}件`);
      
      const deleteResults = {
        success: [],
        failed: [],
        notFound: [],
      };

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

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      const result = {
        success: true,
        total: processedCount,
        deleted: deletedCount,
        skipped: existingEmails.length,
        failed: deleteResults.failed.length + invalidEmails.length,
        errors: [
          ...deleteResults.failed.map(f => ({ email: f.email, error: f.error })),
          ...invalidEmails.map(e => ({ line: e.line, email: e.email, error: e.reason })),
        ],
        details: {
          processed: processedCount,
          deleted: deletedCount,
          skipped: existingEmails.length,
          failed: deleteResults.failed.length + invalidEmails.length,
          deleteResults: deleteResults.success.slice(0, 10), // 最初の10件のみ表示
          invalidEmails: invalidEmails.slice(0, 10), // 最初の10件のみ表示
        },
        duration: `${duration}秒`,
      };

      console.log(`=== CSV削除処理完了（処理時間: ${duration}秒） ===`);
      console.log(`結果: 削除=${result.deleted}件, スキップ=${result.skipped}件, 失敗=${result.failed}件`);

      return Response.json(result);
    }

    // 新規ユーザーを作成（バッチ処理で分割してタイムアウト対策）
    let createResults = { success: [], skipped: [], failed: [] };
    if (recordsToCreate.length > 0) {
      console.log(`ユーザー作成開始: ${recordsToCreate.length}件`);
      
      // バッチサイズを設定（一度に処理する件数）
      const BATCH_SIZE = 50; // 50件ずつ処理
      const batches = [];
      
      for (let i = 0; i < recordsToCreate.length; i += BATCH_SIZE) {
        batches.push(recordsToCreate.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`バッチ処理: ${batches.length}バッチに分割（1バッチあたり最大${BATCH_SIZE}件）`);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`バッチ ${batchIndex + 1}/${batches.length} を処理中: ${batch.length}件`);
        
        try {
          const batchResults = await createUsersBatch(batch, true); // skipExistenceCheck=true（既にチェック済み）
          
          // 結果を統合
          createResults.success.push(...batchResults.success);
          createResults.skipped.push(...batchResults.skipped);
          createResults.failed.push(...batchResults.failed);
          
          console.log(`バッチ ${batchIndex + 1} 完了: 成功=${batchResults.success.length}件, スキップ=${batchResults.skipped.length}件, 失敗=${batchResults.failed.length}件`);
        } catch (batchError) {
          console.error(`バッチ ${batchIndex + 1} エラー:`, batchError);
          
          // バッチエラー時は、そのバッチの全レコードを失敗として記録
          for (const record of batch) {
            createResults.failed.push({
              email: record.email,
              error: batchError.message || 'バッチ処理中にエラーが発生しました',
            });
          }
        }
      }
      
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
      updated: updatedCount,
      deleted: deletedCount,
      skipped: existingEmails.length + createResults.skipped.length + skippedFromFailed.length,
      failed: actualFailed.length + invalidEmails.length,
      errors: [
        ...actualFailed.map(f => ({ email: f.email, error: f.error })),
        ...invalidEmails.map(e => ({ line: e.line, email: e.email, error: e.reason })),
      ],
      details: {
        processed: processedCount,
        created: createResults.success.length,
        updated: updatedCount,
        deleted: deletedCount,
        skipped: existingEmails.length + createResults.skipped.length + skippedFromFailed.length,
        failed: actualFailed.length + invalidEmails.length,
        existingEmails: existingEmails.slice(0, 10), // 最初の10件のみ表示
        invalidEmails: invalidEmails.slice(0, 10), // 最初の10件のみ表示
      },
      duration: `${duration}秒`,
    };

    console.log(`=== CSV一括登録処理完了（処理時間: ${duration}秒） ===`);
    console.log(`結果: 作成=${result.created}件, 更新=${result.updated}件, スキップ=${result.skipped}件, 失敗=${result.failed}件`);

    return Response.json(result);
  } catch (error) {
    console.error('CSV一括登録エラー:', error);
    console.error('エラースタック:', error.stack);
    
    // エラー時も必ずJSONレスポンスを返す
    const errorResponse = {
      success: false,
      error: error.message || 'CSV一括登録中にエラーが発生しました',
      errorType: error.name || 'UnknownError',
      // 部分的な結果がある場合は含める
      partialResults: {
        created: typeof createResults !== 'undefined' ? createResults.success?.length || 0 : 0,
        skipped: typeof createResults !== 'undefined' ? createResults.skipped?.length || 0 : 0,
        failed: typeof createResults !== 'undefined' ? createResults.failed?.length || 0 : 0,
      },
    };
    
    return Response.json(errorResponse, { status: 500 });
  }
}



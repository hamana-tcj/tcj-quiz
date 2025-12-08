/**
 * kintoneからSupabaseへのユーザー同期API
 * 
 * POST /api/sync-kintone-users
 * 
 * リクエストボディ（オプション）:
 * {
 *   "batchSize": 100,        // 1回の処理件数（デフォルト: 100）
 *   "offset": 0,             // オフセット（デフォルト: 0）
 *   "emailFieldCode": "email", // メールアドレスフィールドコード（デフォルト: "email"）
 *   "query": "",             // kintoneクエリ（オプション）
 *   "singleUser": null       // 単一ユーザーのメールアドレス（Webhook用）
 * }
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "processed": 100,
 *   "created": 95,
 *   "skipped": 5,
 *   "failed": 0,
 *   "hasMore": true,
 *   "nextOffset": 100,
 *   "errors": []
 * }
 */

import { getKintoneRecords, getAllKintoneRecords, extractEmailFromRecord, isValidEmail } from '@/lib/kintoneClient';
import { createUserWithTempPassword, createUsersBatch, userExists, deleteUsersBatch } from '@/lib/supabaseAdmin';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      batchSize = 100,
      offset = 0,
      emailFieldCode = 'email',
      query = '',
      singleUser = null, // Webhook用: 単一ユーザーのメールアドレス
      processAll = false, // 全件処理するか（デフォルト: false）
      maxBatches = 10, // 全件処理時の最大バッチ数（タイムアウト防止）
      deleteOrphanedUsers = false, // kintoneに存在しないユーザーを削除するか（デフォルト: false）
    } = body;

    // 単一ユーザー同期（Webhook用）
    if (singleUser) {
      return await syncSingleUser(singleUser);
    }

    // バッチ処理
    let result;
    if (processAll) {
      // 全件処理モード: 複数バッチを連続処理
      result = await syncAllBatches({
        batchSize,
        offset,
        emailFieldCode,
        query,
        maxBatches,
      });
    } else {
      // 通常モード: 1バッチのみ処理
      result = await syncBatch({
        batchSize,
        offset,
        emailFieldCode,
        query,
      });
    }

    // 削除処理（オプション）
    if (deleteOrphanedUsers) {
      const deleteResult = await deleteOrphanedUsersFromSupabase(emailFieldCode, query);
      const resultData = await result.json();
      
      return Response.json({
        ...resultData,
        deletedUsers: deleteResult.deleted,
        deletedCount: deleteResult.deleted.length,
        deleteErrors: deleteResult.errors,
      });
    }

    return result;
  } catch (error) {
    console.error('同期処理エラー:', error);
    return Response.json(
      {
        success: false,
        error: error.message || '不明なエラーが発生しました',
      },
      { status: 500 }
    );
  }
}

/**
 * 単一ユーザー同期（Webhook用）
 */
async function syncSingleUser(email) {
  if (!isValidEmail(email)) {
    return Response.json(
      {
        success: false,
        error: '無効なメールアドレスです',
      },
      { status: 400 }
    );
  }

  try {
    // 既存ユーザーチェック
    const exists = await userExists(email);
    if (exists) {
      return Response.json({
        success: true,
        processed: 1,
        created: 0,
        skipped: 1,
        failed: 0,
        message: 'ユーザーは既に存在します',
      });
    }

    // kintoneからメールアドレスでレコードを検索
    const { getKintoneRecords } = await import('@/lib/kintoneClient');
    const { extractEmailFromRecord } = await import('@/lib/kintoneClient');
    
    // メールアドレスでレコードを検索（emailFieldCodeはデフォルトで'email'を使用）
    const emailFieldCode = 'email';
    const records = await getKintoneRecords({
      limit: 1,
      offset: 0,
      query: `${emailFieldCode} = "${email}"`,
    });

    if (records.length === 0) {
      return Response.json({
        success: false,
        processed: 1,
        created: 0,
        skipped: 0,
        failed: 1,
        error: 'kintoneに該当するレコードが見つかりませんでした',
      }, { status: 404 });
    }

    // 条件チェック: permissionGroupテーブルのgroupNameでフィルタリング
    const record = records[0];
    const permissionGroup = record.permissionGroup;
    
    if (!permissionGroup || !permissionGroup.value || !Array.isArray(permissionGroup.value)) {
      return Response.json({
        success: true,
        processed: 1,
        created: 0,
        skipped: 1,
        failed: 0,
        message: '条件に一致しません（permissionGroupが存在しません）',
      });
    }

    // テーブル内の任意の行で、groupNameが条件に一致するかチェック
    const matchesCondition = permissionGroup.value.some(row => {
      const groupName = row.value?.groupName?.value;
      if (!groupName) return false;
      
      return groupName === '試験対策集中講座（養成）' || 
             groupName === '合格パック単体（養成）';
    });

    if (!matchesCondition) {
      return Response.json({
        success: true,
        processed: 1,
        created: 0,
        skipped: 1,
        failed: 0,
        message: '条件に一致しません（permissionGroup.groupNameが条件に一致しません）',
      });
    }

    // 条件に一致した場合、ユーザー作成
    await createUserWithTempPassword(email);

    return Response.json({
      success: true,
      processed: 1,
      created: 1,
      skipped: 0,
      failed: 0,
      message: 'ユーザーを作成しました',
    });
  } catch (error) {
    console.error('単一ユーザー同期エラー:', error);
    return Response.json(
      {
        success: false,
        processed: 1,
        created: 0,
        skipped: 0,
        failed: 1,
        error: error.message || 'ユーザー作成に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * バッチ処理
 */
async function syncBatch({ batchSize, offset, emailFieldCode, query }) {
  const results = {
    success: true,
    processed: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    hasMore: false,
    nextOffset: offset,
    errors: [],
  };

  try {
    // kintoneからレコード取得
    // 注意: テーブル型フィールドはクエリで直接検索できないため、
    // 全レコードを取得してからJavaScript側でフィルタリング
    const allRecords = await getKintoneRecords({
      limit: batchSize * 2, // フィルタリング後に必要な件数を確保するため、多めに取得
      offset: offset,
      query: query || '', // カスタムクエリが指定されている場合は使用
    });

    if (allRecords.length === 0) {
      return Response.json({
        ...results,
        message: '処理するレコードがありません',
      });
    }

    // permissionGroupテーブルのgroupNameフィールドでフィルタリング
    // クエリが指定されていない場合のみ、デフォルト条件を適用
    let records = allRecords;
    if (!query || query.trim() === '') {
      const beforeFilterCount = allRecords.length;
      records = allRecords.filter(record => {
        // permissionGroupテーブル型フィールドを確認
        const permissionGroup = record.permissionGroup;
        if (!permissionGroup || !permissionGroup.value || !Array.isArray(permissionGroup.value)) {
          return false;
        }

        // テーブル内の任意の行で、groupNameが条件に一致するかチェック
        return permissionGroup.value.some(row => {
          const groupName = row.value?.groupName?.value;
          if (!groupName) return false;
          
          return groupName === '試験対策集中講座（養成）' || 
                 groupName === '合格パック単体（養成）';
        });
      });
      
      console.log(`フィルタリング結果: ${beforeFilterCount}件 → ${records.length}件`);
      
      // デバッグ: 最初のレコードの構造を確認（条件に一致する場合）
      if (records.length > 0) {
        const firstRecord = records[0];
        console.log('条件に一致したレコード例:', {
          email: extractEmailFromRecord(firstRecord, emailFieldCode),
          permissionGroup: firstRecord.permissionGroup ? '存在' : 'なし',
        });
      }
    }

    // バッチサイズに合わせて切り詰め
    records = records.slice(0, batchSize);

    if (records.length === 0) {
      return Response.json({
        ...results,
        message: '条件に一致するレコードがありません',
      });
    }

    // メールアドレスを抽出
    const emails = records
      .map(record => extractEmailFromRecord(record, emailFieldCode))
      .filter(email => email && isValidEmail(email));

    if (emails.length === 0) {
      return Response.json({
        ...results,
        message: '有効なメールアドレスが見つかりませんでした',
      });
    }

    // 既存ユーザーをチェック
    const emailsToCreate = [];
    const existingEmails = [];

    for (const email of emails) {
      try {
        const exists = await userExists(email);
        if (exists) {
          existingEmails.push(email);
        } else {
          emailsToCreate.push(email);
        }
      } catch (error) {
        console.error(`ユーザー存在チェックエラー (${email}):`, error);
        // チェックエラーはスキップして続行
        existingEmails.push(email);
      }
    }

    // 新規ユーザーを作成
    const createResults = await createUsersBatch(emailsToCreate);

    // 結果を集計
    results.processed = emails.length;
    results.created = createResults.success.length;
    results.skipped = existingEmails.length + createResults.skipped.length;
    results.failed = createResults.failed.length;
    results.errors = createResults.failed;

    // 次のバッチがあるかチェック
    if (records.length === batchSize) {
      results.hasMore = true;
      results.nextOffset = offset + batchSize;
    }

    return Response.json({
      ...results,
      message: `処理完了: 作成 ${results.created}件, スキップ ${results.skipped}件, 失敗 ${results.failed}件`,
    });
  } catch (error) {
    console.error('バッチ処理エラー:', error);
    return Response.json(
      {
        success: false,
        processed: results.processed,
        created: results.created,
        skipped: results.skipped,
        failed: results.failed,
        error: error.message || 'バッチ処理中にエラーが発生しました',
        errors: results.errors,
      },
      { status: 500 }
    );
  }
}

/**
 * 全件処理: 複数バッチを連続処理
 */
async function syncAllBatches({ batchSize, offset, emailFieldCode, query, maxBatches }) {
  const allResults = {
    success: true,
    totalProcessed: 0,
    totalCreated: 0,
    totalSkipped: 0,
    totalFailed: 0,
    batches: [],
    errors: [],
  };

  let currentOffset = offset;
  let batchCount = 0;
  let hasMore = true;

  while (hasMore && batchCount < maxBatches) {
    batchCount++;
    
    try {
      const batchResult = await syncBatch({
        batchSize,
        offset: currentOffset,
        emailFieldCode,
        query,
      });

      const result = await batchResult.json();

      // 結果を集計
      allResults.totalProcessed += result.processed || 0;
      allResults.totalCreated += result.created || 0;
      allResults.totalSkipped += result.skipped || 0;
      allResults.totalFailed += result.failed || 0;
      
      if (result.errors && result.errors.length > 0) {
        allResults.errors.push(...result.errors);
      }

      allResults.batches.push({
        batch: batchCount,
        offset: currentOffset,
        ...result,
      });

      // 次のバッチがあるかチェック
      hasMore = result.hasMore === true;
      if (hasMore) {
        currentOffset = result.nextOffset || (currentOffset + batchSize);
      }

      // エラーが発生した場合は中断
      if (!result.success) {
        allResults.success = false;
        break;
      }

    } catch (error) {
      console.error(`バッチ ${batchCount} の処理エラー:`, error);
      allResults.success = false;
      allResults.errors.push({
        batch: batchCount,
        offset: currentOffset,
        error: error.message || '不明なエラー',
      });
      break;
    }
  }

  return Response.json({
    ...allResults,
    message: `全件処理完了: ${batchCount}バッチ処理, 合計 作成 ${allResults.totalCreated}件, スキップ ${allResults.totalSkipped}件, 失敗 ${allResults.totalFailed}件`,
    stoppedEarly: batchCount >= maxBatches && hasMore,
  });
}

/**
 * kintoneに存在しないユーザーをSupabaseから削除
 */
async function deleteOrphanedUsersFromSupabase(emailFieldCode, query) {
  const results = {
    deleted: [],
    errors: [],
  };

  try {
    // 1. kintoneから全レコードを取得（条件に一致するもののみ）
    const { getAllKintoneRecords, extractEmailFromRecord, isValidEmail } = await import('@/lib/kintoneClient');
    
    const allRecords = await getAllKintoneRecords({ 
      query: query || '', 
      batchSize: 500 
    });

    // 2. kintoneに存在するメールアドレスのリストを作成
    const kintoneEmails = new Set();
    
    for (const record of allRecords) {
      // 条件フィルタリング（クエリが空の場合はデフォルト条件を適用）
      if (!query || query.trim() === '') {
        const permissionGroup = record.permissionGroup;
        if (permissionGroup && permissionGroup.value && Array.isArray(permissionGroup.value)) {
          const matchesCondition = permissionGroup.value.some(row => {
            const groupName = row.value?.groupName?.value;
            if (!groupName) return false;
            return groupName === '試験対策集中講座（養成）' || 
                   groupName === '合格パック単体（養成）';
          });
          
          if (!matchesCondition) {
            continue; // 条件に一致しない場合はスキップ
          }
        } else {
          continue; // permissionGroupが存在しない場合はスキップ
        }
      }

      const email = extractEmailFromRecord(record, emailFieldCode);
      if (email && isValidEmail(email)) {
        kintoneEmails.add(email.toLowerCase());
      }
    }

    console.log(`kintoneに存在するメールアドレス: ${kintoneEmails.size}件`);

    // 3. Supabaseの全ユーザーを取得
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
    if (!supabaseAdmin) {
      throw new Error('Supabase Adminクライアントが初期化されていません');
    }

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      throw usersError;
    }

    // 4. kintoneに存在しないユーザーを特定
    const usersToDelete = usersData.users.filter(user => {
      if (!user.email) return false;
      return !kintoneEmails.has(user.email.toLowerCase());
    });

    console.log(`削除対象ユーザー: ${usersToDelete.length}件`);

    // 5. ユーザーを削除
    const deleteResults = await deleteUsersBatch(usersToDelete.map(u => u.email));

    results.deleted = deleteResults.success.map(r => r.email);
    results.errors = deleteResults.failed;

    console.log(`削除完了: ${results.deleted.length}件, エラー: ${results.errors.length}件`);

  } catch (error) {
    console.error('削除処理エラー:', error);
    results.errors.push({
      error: error.message || '不明なエラー',
    });
  }

  return results;
}

// GETリクエストでヘルスチェックとkintone接続テスト
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const testKintone = searchParams.get('test') === 'kintone';
  
  if (testKintone) {
    // kintone接続テスト
    try {
      const { getKintoneRecords } = await import('@/lib/kintoneClient');
      
      // テスト1: クエリなしで全件取得を試す
      let testResults = [];
      
      try {
        const records1 = await getKintoneRecords({ limit: 1, offset: 0, query: '' });
        testResults.push({ method: 'クエリなし', success: true, count: records1.length });
      } catch (e1) {
        testResults.push({ method: 'クエリなし', success: false, error: e1.message });
      }
      
      // テスト2: 最小限のクエリ
      try {
        const records2 = await getKintoneRecords({ limit: 1, offset: 0, query: 'limit 1' });
        testResults.push({ method: 'limit 1', success: true, count: records2.length });
      } catch (e2) {
        testResults.push({ method: 'limit 1', success: false, error: e2.message });
      }
      
      // テスト3: order byを含むクエリ
      try {
        const records3 = await getKintoneRecords({ limit: 1, offset: 0, query: 'order by $id asc limit 1' });
        testResults.push({ method: 'order by $id asc limit 1', success: true, count: records3.length });
      } catch (e3) {
        testResults.push({ method: 'order by $id asc limit 1', success: false, error: e3.message });
      }
      
      const successCount = testResults.filter(r => r.success).length;
      
      return Response.json({
        success: successCount > 0,
        message: `${successCount}/${testResults.length} のテストが成功`,
        testResults: testResults,
        sampleRecord: testResults.find(r => r.success && r.count > 0) ? '取得成功' : null,
      });
    } catch (error) {
      return Response.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }
  }
  
  return Response.json({
    message: 'kintoneユーザー同期API',
    endpoints: {
      POST: 'ユーザー同期を実行',
      'GET ?test=kintone': 'kintone接続テスト',
    },
  });
}


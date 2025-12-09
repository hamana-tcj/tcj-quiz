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

import { getKintoneRecords, getAllKintoneRecords, extractEmailFromRecord, extractRecordIdFromRecord, isValidEmail } from '@/lib/kintoneClient';
import { createUserWithTempPassword, createUsersBatch, userExists, deleteUsersBatch, getUserByKintoneRecordId, updateUserEmail } from '@/lib/supabaseAdmin';

export async function POST(request) {
  const startTime = Date.now();
  console.log('=== kintone → Supabase ユーザー同期処理開始 ===');
  console.log('開始時刻:', new Date().toISOString());
  
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

    console.log('リクエストパラメータ:', {
      batchSize,
      offset,
      emailFieldCode,
      query: query || '(空)',
      singleUser: singleUser || '(なし)',
      processAll,
      maxBatches,
      deleteOrphanedUsers,
    });

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
      console.log('削除処理を開始します...');
      const deleteResult = await deleteOrphanedUsersFromSupabase(emailFieldCode, query);
      const resultData = await result.json();
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      console.log(`=== 同期処理完了（処理時間: ${duration}秒） ===`);
      
      return Response.json({
        ...resultData,
        deletedUsers: deleteResult.deleted,
        deletedCount: deleteResult.deleted.length,
        deleteErrors: deleteResult.errors,
        duration: `${duration}秒`,
      });
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`=== 同期処理完了（処理時間: ${duration}秒） ===`);
    
    const resultData = await result.json();
    return Response.json({
      ...resultData,
      duration: `${duration}秒`,
    });
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
    // kintoneからメールアドレスでレコードを検索
    const { getKintoneRecords, extractEmailFromRecord, extractRecordIdFromRecord } = await import('@/lib/kintoneClient');
    
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
        updated: 0,
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
        updated: 0,
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

    // レコードIDとメールアドレスを取得
    const recordId = extractRecordIdFromRecord(record);
    const currentEmail = extractEmailFromRecord(record, emailFieldCode);

    // kintoneレコードIDで既存ユーザーを検索
    let existingUser = null;
    if (recordId) {
      existingUser = await getUserByKintoneRecordId(recordId);
    }

    if (existingUser) {
      // kintoneレコードIDで見つかった場合
      if (existingUser.email !== currentEmail) {
        // メールアドレスが変更されている場合は更新
        await updateUserEmail(existingUser.id, currentEmail);
        return Response.json({
          success: true,
          processed: 1,
          created: 0,
          updated: 1,
          skipped: 0,
          failed: 0,
          message: `メールアドレスを更新しました: ${existingUser.email} → ${currentEmail}`,
        });
      } else {
        // メールアドレスが同じ場合はスキップ
        return Response.json({
          success: true,
          processed: 1,
          created: 0,
          updated: 0,
          skipped: 1,
          failed: 0,
          message: 'ユーザーは既に存在します',
        });
      }
    } else {
      // 既存ユーザーチェック（メールアドレスで）
      const exists = await userExists(currentEmail);
      if (exists) {
        return Response.json({
          success: true,
          processed: 1,
          created: 0,
          updated: 0,
          skipped: 1,
          failed: 0,
          message: 'ユーザーは既に存在します',
        });
      }

      // 条件に一致した場合、ユーザー作成
      await createUserWithTempPassword(currentEmail, null, recordId);

      return Response.json({
        success: true,
        processed: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        failed: 0,
        message: 'ユーザーを作成しました',
      });
    }
  } catch (error) {
    console.error('単一ユーザー同期エラー:', error);
    return Response.json(
      {
        success: false,
        processed: 1,
        created: 0,
        updated: 0,
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
    // フィルタリング後に必要な件数を確保するため、多めに取得（最大500件）
    const fetchLimit = Math.max(batchSize * 5, 500); // フィルタリング後の件数を考慮して多めに取得
    const allRecords = await getKintoneRecords({
      limit: fetchLimit,
      offset: offset,
      query: query || '', // カスタムクエリが指定されている場合は使用
    });

    console.log(`kintoneから取得: ${allRecords.length}件 (offset: ${offset}, limit: ${fetchLimit})`);

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
      } else if (beforeFilterCount > 0) {
        // フィルタリングで0件になった場合、レコードの構造を確認
        console.log('警告: フィルタリング後に0件になりました。レコード構造を確認:');
        console.log('サンプルレコード:', JSON.stringify(allRecords[0], null, 2));
      }
    }

    // バッチサイズに合わせて切り詰め
    const recordsToProcess = records.slice(0, batchSize);
    const remainingRecords = records.slice(batchSize);

    if (recordsToProcess.length === 0) {
      // フィルタリング後に0件になった場合、次のバッチがあるかチェック
      // kintoneから取得したレコード数がlimitと同じ場合、次のバッチがある可能性がある
      const hasMoreRecords = allRecords.length >= fetchLimit;
      
      return Response.json({
        ...results,
        message: hasMoreRecords 
          ? '条件に一致するレコードがありません（次のバッチを確認）' 
          : '条件に一致するレコードがありません',
        hasMore: hasMoreRecords,
        nextOffset: hasMoreRecords ? offset + allRecords.length : offset,
      });
    }

    // レコードIDとメールアドレスを抽出
    const recordData = recordsToProcess
      .map(record => {
        const email = extractEmailFromRecord(record, emailFieldCode);
        const recordId = extractRecordIdFromRecord(record);
        return { email, recordId, record };
      })
      .filter(item => item.email && isValidEmail(item.email));

    if (recordData.length === 0) {
      return Response.json({
        ...results,
        message: '有効なメールアドレスが見つかりませんでした',
      });
    }

    // 既存ユーザーをチェック・更新
    const recordsToCreate = [];
    const existingEmails = [];
    let updatedCount = 0;

    for (const { email, recordId } of recordData) {
      try {
        console.log(`処理中: email=${email}, recordId=${recordId}`);
        
        // まずkintoneレコードIDで既存ユーザーを検索
        let existingUser = null;
        if (recordId) {
          existingUser = await getUserByKintoneRecordId(recordId);
          if (existingUser) {
            console.log(`kintoneレコードID ${recordId} で既存ユーザーを発見: ${existingUser.email} (ID: ${existingUser.id})`);
          } else {
            console.log(`kintoneレコードID ${recordId} で既存ユーザーが見つかりませんでした`);
          }
        } else {
          console.log(`レコードIDが取得できませんでした: ${JSON.stringify(recordData.find(r => r.email === email)?.record)}`);
        }

        if (existingUser) {
          // kintoneレコードIDで見つかった場合
          if (existingUser.email !== email) {
            // メールアドレスが変更されている場合は更新
            try {
              console.log(`メールアドレス更新を実行: ${existingUser.email} → ${email}`);
              await updateUserEmail(existingUser.id, email);
              updatedCount++;
              console.log(`✅ メールアドレス更新成功: ${existingUser.email} → ${email} (レコードID: ${recordId})`);
            } catch (updateError) {
              console.error(`❌ メールアドレス更新エラー (${email}):`, updateError);
              results.failed++;
              results.errors.push({
                email,
                error: `メールアドレス更新失敗: ${updateError.message}`,
              });
            }
          } else {
            // メールアドレスが同じ場合はスキップ
            console.log(`メールアドレスが同じためスキップ: ${email}`);
            existingEmails.push(email);
          }
        } else {
          // kintoneレコードIDで見つからない場合、メールアドレスで検索
          const exists = await userExists(email);
          if (exists) {
            console.log(`メールアドレスで既存ユーザーを発見（レコードIDなし）: ${email}`);
            existingEmails.push(email);
          } else {
            // 新規ユーザーとして作成
            console.log(`新規ユーザーとして作成: ${email} (レコードID: ${recordId || 'なし'})`);
            recordsToCreate.push({ email, kintoneRecordId: recordId });
          }
        }
      } catch (error) {
        console.error(`ユーザー存在チェックエラー (${email}):`, error);
        // チェックエラーはスキップして続行
        existingEmails.push(email);
      }
    }

    // 新規ユーザーを作成
    const createResults = await createUsersBatch(recordsToCreate);

    // 結果を集計
    results.processed = recordData.length;
    results.created = createResults.success.length;
    results.updated = updatedCount;
    results.skipped = existingEmails.length + createResults.skipped.length;
    results.failed = createResults.failed.length + (results.errors?.length || 0);
    results.errors = [...(results.errors || []), ...createResults.failed];

    // 次のバッチがあるかチェック
    // フィルタリング後の残りレコードがある場合、またはkintoneから取得したレコード数がlimitと同じ場合
    const hasMoreFilteredRecords = remainingRecords.length > 0;
    const hasMoreKintoneRecords = allRecords.length >= fetchLimit;
    
    if (hasMoreFilteredRecords || hasMoreKintoneRecords) {
      results.hasMore = true;
      // フィルタリング後の残りレコードがある場合は、現在のoffsetを維持
      // ない場合は、取得したレコード数分オフセットを進める
      results.nextOffset = hasMoreFilteredRecords ? offset : offset + allRecords.length;
      console.log(`次のバッチがあります: offset=${results.nextOffset}, 残りフィルタ済み=${remainingRecords.length}件, kintone残り=${hasMoreKintoneRecords ? 'あり' : 'なし'}`);
    }

    const messageParts = [];
    if (results.created > 0) messageParts.push(`作成 ${results.created}件`);
    if (results.updated > 0) messageParts.push(`更新 ${results.updated}件`);
    if (results.skipped > 0) messageParts.push(`スキップ ${results.skipped}件`);
    if (results.failed > 0) messageParts.push(`失敗 ${results.failed}件`);
    
    return Response.json({
      ...results,
      message: `処理完了: ${messageParts.join(', ')}`,
    });
  } catch (error) {
    console.error('バッチ処理エラー:', error);
    console.error('エラースタック:', error.stack);
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
  const startTime = Date.now();
  console.log('全件処理モード開始');
  
  const allResults = {
    success: true,
    totalProcessed: 0,
    totalCreated: 0,
    totalUpdated: 0,
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
      allResults.totalUpdated += result.updated || 0;
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

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log(`=== 全件処理完了 ===`);
  console.log(`処理時間: ${duration}秒`);
  console.log(`バッチ数: ${batchCount}`);
  console.log(`作成: ${allResults.totalCreated}件`);
  if (allResults.totalUpdated > 0) {
    console.log(`更新: ${allResults.totalUpdated}件`);
  }
  console.log(`スキップ: ${allResults.totalSkipped}件`);
  console.log(`失敗: ${allResults.totalFailed}件`);
  
    const messageParts = [];
    if (allResults.totalCreated > 0) messageParts.push(`作成 ${allResults.totalCreated}件`);
    if (allResults.totalUpdated > 0) messageParts.push(`更新 ${allResults.totalUpdated}件`);
    if (allResults.totalSkipped > 0) messageParts.push(`スキップ ${allResults.totalSkipped}件`);
    if (allResults.totalFailed > 0) messageParts.push(`失敗 ${allResults.totalFailed}件`);
    
    return Response.json({
    ...allResults,
    message: `全件処理完了: ${batchCount}バッチ処理, 合計 ${messageParts.join(', ')}`,
    stoppedEarly: batchCount >= maxBatches && hasMore,
    duration: `${duration}秒`,
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

    // 2. kintoneに存在するメールアドレスとレコードIDのリストを作成
    const kintoneEmails = new Set();
    const kintoneRecordIds = new Set();
    
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

      // レコードIDも取得
      const { extractRecordIdFromRecord } = await import('@/lib/kintoneClient');
      const recordId = extractRecordIdFromRecord(record);
      if (recordId) {
        kintoneRecordIds.add(String(recordId));
      }
    }

    console.log(`kintoneに存在するメールアドレス: ${kintoneEmails.size}件`);
    console.log(`kintoneに存在するレコードID: ${kintoneRecordIds.size}件`);

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
    // メールアドレスが変更されたケースを考慮するため、kintoneレコードIDも確認
    const usersToDelete = usersData.users.filter(user => {
      if (!user.email) return false;
      
      // kintoneレコードIDで確認（メールアドレスが変更された場合でも削除しない）
      const userRecordId = user.user_metadata?.kintone_record_id;
      if (userRecordId && kintoneRecordIds.has(String(userRecordId))) {
        console.log(`レコードID ${userRecordId} でkintoneに存在するため削除しない: ${user.email}`);
        return false; // kintoneに存在する（メールアドレスが変更された可能性がある）
      }
      
      // メールアドレスで確認
      const emailExists = kintoneEmails.has(user.email.toLowerCase());
      if (!emailExists) {
        console.log(`削除対象: ${user.email} (レコードID: ${userRecordId || 'なし'})`);
      }
      return !emailExists;
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


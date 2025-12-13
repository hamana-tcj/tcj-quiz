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
import { createUserWithTempPassword, createUsersBatch, userExists, deleteUsersBatch, getUserByKintoneRecordId, updateUserEmail, getUserByEmailWithPagination, updateUserMetadata } from '@/lib/supabaseAdmin';

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
async function syncBatch({ batchSize, offset, emailFieldCode, query, remainingFilteredRecords = [] }) {
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
    console.log(`[バッチ処理開始] offset=${offset}, batchSize=${batchSize}, 前回残り=${remainingFilteredRecords.length}件`);
    
    // 前のバッチの残りレコードがある場合、kintoneから新しいレコードを取得しない
    // 残りレコードを処理し終わった後に、次のoffsetから新しいレコードを取得する
    let allRecords = [];
    let records = [];
    
    if (remainingFilteredRecords.length > 0) {
      // 残りレコードがある場合、kintoneから新しいレコードを取得しない
      console.log(`[残りレコード処理] 前回の残り${remainingFilteredRecords.length}件を処理します（kintoneからは取得しません）`);
      records = []; // 新しいレコードは取得しない
    } else {
      // 残りレコードがない場合、kintoneから新しいレコードを取得
      // 注意: テーブル型フィールドはクエリで直接検索できないため、
      // 全レコードを取得してからJavaScript側でフィルタリング
      // フィルタリング後に必要な件数を確保するため、多めに取得（最大500件）
      const fetchLimit = Math.max(batchSize * 5, 500); // フィルタリング後の件数を考慮して多めに取得
      allRecords = await getKintoneRecords({
        limit: fetchLimit,
        offset: offset,
        query: query || '', // カスタムクエリが指定されている場合は使用
      });

      console.log(`kintoneから取得: ${allRecords.length}件 (offset: ${offset}, limit: ${fetchLimit})`);

      if (allRecords.length === 0) {
        console.log(`[バッチ処理終了] レコードがありません`);
        return Response.json({
          ...results,
          message: '処理するレコードがありません',
        });
      }

      // permissionGroupテーブルのgroupNameフィールドでフィルタリング
      // クエリが指定されていない場合のみ、デフォルト条件を適用
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
        
        console.log(`[フィルタリング] ${beforeFilterCount}件 → ${records.length}件 (条件に一致したレコード数)`);
        
        // デバッグ: 最初のレコードの構造を確認（条件に一致する場合）
        if (records.length > 0) {
          const firstRecord = records[0];
          const permissionGroup = firstRecord.permissionGroup;
          const groupNames = permissionGroup?.value?.map(row => row.value?.groupName?.value).filter(Boolean) || [];
          console.log('条件に一致したレコード例:', {
            email: extractEmailFromRecord(firstRecord, emailFieldCode),
            permissionGroup: permissionGroup ? '存在' : 'なし',
            groupNames: groupNames,
            groupNamesCount: groupNames.length, // 複数値の数を表示
          });
          
          // 複数値がある場合の詳細を表示（最初の3件のみ）
          if (groupNames.length > 1) {
            console.log(`[複数値検出] レコードに${groupNames.length}個のgroupNameが含まれています:`, groupNames);
          }
        } else if (beforeFilterCount > 0) {
          // フィルタリングで0件になった場合、レコードの構造を確認
          console.log('警告: フィルタリング後に0件になりました。レコード構造を確認:');
          const sampleRecord = allRecords[0];
          const permissionGroup = sampleRecord?.permissionGroup;
          const groupNames = permissionGroup?.value?.map(row => row.value?.groupName?.value).filter(Boolean) || [];
          console.log('サンプルレコードのpermissionGroup:', {
            exists: !!permissionGroup,
            hasValue: !!permissionGroup?.value,
            isArray: Array.isArray(permissionGroup?.value),
            groupNames: groupNames,
            groupNamesCount: groupNames.length,
            // テーブル型フィールドの構造を詳しく確認
            rawStructure: permissionGroup ? {
              hasValue: !!permissionGroup.value,
              valueType: typeof permissionGroup.value,
              isArray: Array.isArray(permissionGroup.value),
              arrayLength: Array.isArray(permissionGroup.value) ? permissionGroup.value.length : 0,
              firstRow: Array.isArray(permissionGroup.value) && permissionGroup.value.length > 0 ? {
                hasValue: !!permissionGroup.value[0].value,
                hasGroupName: !!permissionGroup.value[0].value?.groupName,
                groupNameValue: permissionGroup.value[0].value?.groupName?.value,
              } : null,
            } : null,
          });
        }
        
        // 統計情報: フィルタリング条件に一致しないレコードの理由を分析（最初のバッチのみ詳細出力）
        if (beforeFilterCount > 0 && records.length < beforeFilterCount && offset === 0) {
          const filteredOut = beforeFilterCount - records.length;
          const noPermissionGroup = allRecords.filter(r => !r.permissionGroup || !r.permissionGroup.value || !Array.isArray(r.permissionGroup.value)).length;
          const hasPermissionGroupButNoMatch = allRecords.filter(r => {
            const pg = r.permissionGroup;
            if (!pg || !pg.value || !Array.isArray(pg.value)) return false;
            const hasMatch = pg.value.some(row => {
              const groupName = row.value?.groupName?.value;
              return groupName === '試験対策集中講座（養成）' || groupName === '合格パック単体（養成）';
            });
            return !hasMatch;
          }).length;
          
          console.log(`[フィルタリング統計] 除外: ${filteredOut}件 (permissionGroupなし: ${noPermissionGroup}件, 条件不一致: ${hasPermissionGroupButNoMatch}件)`);
        }
      } else {
        // クエリが指定されている場合、フィルタリングしない
        records = allRecords;
      }
    }

    // 前のバッチの残りレコードと今回のフィルタリング結果を結合
    const allFilteredRecords = [...remainingFilteredRecords, ...records];
    
    // バッチサイズに合わせて切り詰め
    const recordsToProcess = allFilteredRecords.slice(0, batchSize);
    const remainingRecords = allFilteredRecords.slice(batchSize);
    
    console.log(`フィルタリング後のレコード: 前回残り=${remainingFilteredRecords.length}件, 今回=${records.length}件, 合計=${allFilteredRecords.length}件, 処理対象=${recordsToProcess.length}件, 残り=${remainingRecords.length}件`);

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

    // レコードIDとメールアドレスを抽出（メールアドレスを正規化）
    const recordData = recordsToProcess
      .map(record => {
        const email = extractEmailFromRecord(record, emailFieldCode);
        const recordId = extractRecordIdFromRecord(record);
        // メールアドレスを小文字に正規化
        const normalizedEmail = email ? email.toLowerCase().trim() : null;
        return { email: normalizedEmail, originalEmail: email, recordId, record };
      })
      .filter(item => item.email && isValidEmail(item.email));

    if (recordData.length === 0) {
      return Response.json({
        ...results,
        message: '有効なメールアドレスが見つかりませんでした',
      });
    }

    // 既存ユーザーをチェック・更新
    // 最適化: バッチ処理の開始時に一度だけ全ユーザーを取得して、メモリ上で検索
    console.log(`[ユーザーチェック開始] ${recordData.length}件のレコードをチェックします`);
    console.log(`[最適化] 全ユーザーを一度に取得してメモリ上で検索します...`);
    
    const allSupabaseUsers = [];
    let page = 1;
    const perPage = 1000;
    let hasMore = true;
    const supabaseAdmin = (await import('@/lib/supabaseAdmin')).supabaseAdmin;
    
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

    const recordsToCreate = [];
    const existingEmails = [];
    let updatedCount = 0;

    // ログ行数を節約: 集計のみを出力し、個別のログは削減（最初のバッチのみ詳細ログ）
    let newUserCandidates = 0;
    let emailUpdateCandidates = 0;
    let metadataUpdateCandidates = 0;
    
    for (const { email, recordId } of recordData) {
      try {
        // まずkintoneレコードIDで既存ユーザーを検索（メモリ上で検索）
        let existingUser = null;
        if (recordId) {
          existingUser = usersByKintoneRecordId.get(String(recordId));
        }

        if (existingUser) {
          // kintoneレコードIDで見つかった場合
          // メールアドレスを正規化して比較
          const existingEmailNormalized = existingUser.email?.toLowerCase().trim();
          if (existingEmailNormalized !== email) {
            // メールアドレスが変更されている場合は更新
            try {
              if (offset === 0 && emailUpdateCandidates < 2) {
                console.log(`[メール更新] ${existingUser.email} → ${email} (レコードID: ${recordId})`);
              }
              await updateUserEmail(existingUser.id, email);
              updatedCount++;
              emailUpdateCandidates++;
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
            existingEmails.push(email);
          }
        } else {
          // kintoneレコードIDで見つからない場合、メールアドレスで検索（メモリ上で検索）
          const normalizedEmail = email.toLowerCase().trim();
          const existingUserByEmail = usersByEmail.get(normalizedEmail);
          
          if (existingUserByEmail) {
            // 既存ユーザーにkintoneレコードIDを追加
            if (recordId) {
              try {
                // kintoneレコードIDが既に設定されているかチェック
                const currentRecordId = existingUserByEmail.user_metadata?.kintone_record_id;
                if (!currentRecordId) {
                  if (offset === 0 && metadataUpdateCandidates < 2) {
                    console.log(`[メタデータ更新] email=${email}, recordId=${recordId}`);
                  }
                  await updateUserMetadata(existingUserByEmail.id, recordId);
                  updatedCount++;
                  metadataUpdateCandidates++;
                }
              } catch (updateError) {
                console.error(`❌ kintoneレコードID追加エラー (${email}):`, updateError);
                // エラーが発生しても処理は続行
              }
            }
            
            existingEmails.push(email);
          } else {
            // 新規ユーザーとして作成
            if (offset === 0 && newUserCandidates < 2) {
              console.log(`[新規ユーザー作成予定] email=${email}, recordId=${recordId || 'なし'}`);
            }
            newUserCandidates++;
            recordsToCreate.push({ email, kintoneRecordId: recordId });
          }
        }
      } catch (error) {
        console.error(`ユーザー存在チェックエラー (${email}):`, error);
        // チェックエラーはスキップして続行
        existingEmails.push(email);
      }
    }
    
    // 集計ログを出力（ログ行数を節約）
    if (newUserCandidates > 0 || emailUpdateCandidates > 0 || metadataUpdateCandidates > 0 || existingEmails.length > 0) {
      console.log(`[処理サマリー] offset=${offset}, 新規=${newUserCandidates}件, メール更新=${emailUpdateCandidates}件, メタデータ更新=${metadataUpdateCandidates}件, 既存=${existingEmails.length}件`);
    }

    // 新規ユーザーを作成
    // 注意: syncBatchで既に既存ユーザーチェックを行っているため、
    // createUsersBatchでは既存ユーザーチェックをスキップする
    console.log(`[ユーザー作成開始] ${recordsToCreate.length}件の新規ユーザーを作成します`);
    const createResults = await createUsersBatch(recordsToCreate, true); // skipExistenceCheck=true
    console.log(`[ユーザー作成完了] 成功=${createResults.success.length}件, スキップ=${createResults.skipped.length}件, 失敗=${createResults.failed.length}件`);
    
    // 既存ユーザーエラーをスキップとして扱う（createUsersBatch内で検出された場合）
    if (createResults.skipped.length > 0) {
      console.warn(`⚠️ 警告: ${createResults.skipped.length}件のユーザーが既に存在していました（createUsersBatch内で検出）`);
    }

    // 結果を集計
    // 既存ユーザーエラーをスキップとして扱う（失敗から除外）
    const actualFailed = createResults.failed.filter(f => {
      // 既存ユーザーエラーは失敗としてカウントしない
      return !f.error || (
        !f.error.includes('already been registered') &&
        !f.error.includes('already exists') &&
        !f.error.includes('User already registered')
      );
    });
    const skippedFromFailed = createResults.failed.filter(f => {
      // 既存ユーザーエラーはスキップとして扱う
      return f.error && (
        f.error.includes('already been registered') ||
        f.error.includes('already exists') ||
        f.error.includes('User already registered')
      );
    });
    
    results.processed = recordData.length;
    results.created = createResults.success.length;
    results.updated = updatedCount;
    results.skipped = existingEmails.length + createResults.skipped.length + skippedFromFailed.length;
    results.failed = actualFailed.length + (results.errors?.length || 0);
    results.errors = [...(results.errors || []), ...actualFailed];

    // 次のバッチがあるかチェック
    // フィルタリング後の残りレコードがある場合、またはkintoneから取得したレコード数がlimitと同じ場合
    const hasMoreFilteredRecords = remainingRecords.length > 0;
    const hasMoreKintoneRecords = remainingFilteredRecords.length === 0 && allRecords.length >= (Math.max(batchSize * 5, 500));
    
    // 残りレコードがある場合、offsetを進めない（次のバッチで残りレコードを処理）
    // 残りレコードがない場合のみ、offsetを進める
    let nextOffset = offset;
    if (remainingFilteredRecords.length === 0 && allRecords.length > 0) {
      // kintone APIの制限: offsetは最大10,000件まで
      // offsetが10,000を超える場合は、レコードIDベースの取得に切り替える
      const calculatedNextOffset = offset + allRecords.length;
      const useRecordIdBased = calculatedNextOffset > 10000;
      
      if (useRecordIdBased) {
        // レコードIDベースの取得に切り替え
        // 最後に取得したレコードのIDを取得
        const lastRecordId = allRecords.length > 0 
          ? extractRecordIdFromRecord(allRecords[allRecords.length - 1])
          : null;
        
        if (lastRecordId) {
          // レコードIDをnextOffsetとして使用（文字列として保存）
          nextOffset = `id:${lastRecordId}`;
          console.log(`⚠️ offsetが10,000を超えるため、レコードIDベースの取得に切り替えます: offset=${offset} → nextRecordId=${lastRecordId}`);
        } else {
          // レコードIDが取得できない場合は、offsetを維持（エラーになる可能性がある）
          nextOffset = calculatedNextOffset;
          console.warn(`⚠️ レコードIDが取得できませんでした。offset=${calculatedNextOffset}で続行しますが、エラーになる可能性があります。`);
        }
      } else {
        nextOffset = calculatedNextOffset;
      }
    }
    
    results.nextOffset = nextOffset;
    
    // kintoneから実際に取得したoffsetの情報を記録（offset範囲の記録用）
    if (remainingFilteredRecords.length === 0 && allRecords.length > 0) {
      // kintoneから取得した場合、offset範囲を記録
      results.kintoneOffsetRange = {
        start: offset, // 取得開始時のoffset
        end: nextOffset, // 取得終了時のnextOffset（次のoffsetの開始位置）
        recordsFetched: allRecords.length, // kintoneから取得したレコード数
      };
    }
    
    if (hasMoreFilteredRecords || hasMoreKintoneRecords) {
      results.hasMore = true;
      console.log(`次のバッチがあります: offset=${offset} → nextOffset=${results.nextOffset}, 取得レコード数=${allRecords.length}, 残りフィルタ済み=${remainingRecords.length}件, kintone残り=${hasMoreKintoneRecords ? 'あり' : 'なし'}`);
    } else {
      console.log(`次のバッチはありません: offset=${offset}, 取得レコード数=${allRecords.length}, フィルタ済み=${records.length}件`);
    }

    const messageParts = [];
    if (results.created > 0) messageParts.push(`作成 ${results.created}件`);
    if (results.updated > 0) messageParts.push(`更新 ${results.updated}件`);
    if (results.skipped > 0) messageParts.push(`スキップ ${results.skipped}件`);
    if (results.failed > 0) messageParts.push(`失敗 ${results.failed}件`);
    
    return Response.json({
      ...results,
      message: `処理完了: ${messageParts.join(', ')}`,
      remainingFilteredRecords: remainingRecords, // 次のバッチで処理する残りレコード（実際のレコード配列）
      remainingFilteredCount: remainingRecords.length, // 次のバッチで処理する残りレコード数
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

  let startOffset = offset; // 開始offsetを記録（最初にkintoneから取得したoffsetで更新される可能性がある）
  let currentOffset = offset;
  let endOffset = offset; // 終了offsetを記録（処理が進むたびに更新）
  let batchCount = 0;
  let hasMore = true;
  let remainingFilteredRecords = []; // フィルタリング後の残りレコードを保持
  let previousHasMoreKintoneRecords = false; // 前回のkintoneに残りレコードがあるかのフラグ
  let lastKintoneNextOffset = offset; // 最後にkintoneから取得した場合のnextOffsetを保持

  // タイムアウト対策: 処理時間を監視（Vercelの制限: 10秒/60秒）
  // Vercel Hobbyプラン: 10秒、Proプラン: 60秒
  // 安全マージンを考慮して50秒に設定（Hobbyプランでは10秒でタイムアウトする可能性がある）
  const MAX_EXECUTION_TIME = 50000; // 50秒（安全マージン）
  const startTimeForTimeout = Date.now();
  console.log(`タイムアウト設定: ${MAX_EXECUTION_TIME}ms (${MAX_EXECUTION_TIME / 1000}秒)`);

  while (hasMore && batchCount < maxBatches) {
    // タイムアウトチェック
    const elapsed = Date.now() - startTimeForTimeout;
    if (elapsed > MAX_EXECUTION_TIME) {
      console.log(`タイムアウト対策: ${elapsed}ms経過したため処理を中断します`);
      allResults.stoppedEarly = true;
      allResults.stoppedReason = 'timeout';
      break;
    }

    batchCount++;
    console.log(`バッチ ${batchCount}/${maxBatches} を処理中... (経過時間: ${(elapsed / 1000).toFixed(2)}秒)`);
    
    try {
      const batchStartTime = Date.now();
      const batchResult = await syncBatch({
        batchSize,
        offset: currentOffset,
        emailFieldCode,
        query,
        remainingFilteredRecords, // 前のバッチの残りレコードを渡す
      });
      const batchElapsed = Date.now() - batchStartTime;
      console.log(`バッチ ${batchCount} の処理時間: ${(batchElapsed / 1000).toFixed(2)}秒`);

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

      // 終了offsetを更新（処理が進むたびに更新）
      endOffset = currentOffset;
      
      allResults.batches.push({
        batch: batchCount,
        offset: currentOffset,
        nextOffset: result.nextOffset,
        ...result,
      });

      // 処理したoffsetの範囲を更新
      // kintoneから実際に取得したoffsetを記録（kintoneOffsetRangeが存在する場合のみ）
      if (result.kintoneOffsetRange) {
        // kintoneから取得した場合、offset範囲を更新
        if (batchCount === 1 || startOffset === offset) {
          startOffset = result.kintoneOffsetRange.start; // 最初にkintoneから取得したoffset
        }
        endOffset = result.kintoneOffsetRange.end; // 最後にkintoneから取得したnextOffset（次のoffsetの開始位置）
        console.log(`[offset範囲更新] バッチ${batchCount}: kintone取得範囲 ${result.kintoneOffsetRange.start} → ${result.kintoneOffsetRange.end} (${result.kintoneOffsetRange.recordsFetched}件取得)`);
      }

      // 残りレコードを取得（次のバッチで処理するため）
      remainingFilteredRecords = result.remainingFilteredRecords || [];
      
      // 前回のkintoneに残りレコードがあるかのフラグを更新
      // remainingFilteredRecords.length === 0の場合、result.hasMoreがtrueならkintoneに残りレコードがある
      if (remainingFilteredRecords.length === 0 && result.hasMore === true) {
        previousHasMoreKintoneRecords = true;
      } else if (remainingFilteredRecords.length > 0) {
        // 残りレコードがある場合、前回のフラグを保持
        // (次のバッチで残りレコードを処理した後、kintoneから新しいレコードを取得する必要があるか判定するため)
      } else {
        // remainingFilteredRecords.length === 0 && result.hasMore === false の場合
        // ただし、前回のフラグがtrueの場合は保持（残りレコードを処理し終わった後、kintoneから新しいレコードを取得する必要があるため）
        if (!previousHasMoreKintoneRecords) {
          previousHasMoreKintoneRecords = false;
        }
      }
      
      // result.nextOffsetが更新されている場合（kintoneから取得した場合）、lastKintoneNextOffsetを更新
      // これは、残りレコードを処理し終わった後、次のkintone取得で使用するため
      if (result.nextOffset !== currentOffset && result.nextOffset !== offset) {
        // kintoneから取得した場合、nextOffsetを保持
        lastKintoneNextOffset = result.nextOffset;
        console.log(`[lastKintoneNextOffset更新] ${lastKintoneNextOffset}`);
      }
      
      // 次のバッチがあるかチェック
      // 残りレコードがある場合、またはkintoneから取得できるレコードがまだある場合
      // lastKintoneNextOffsetがoffsetと異なる場合、まだkintoneにレコードが残っている可能性がある
      // （lastKintoneNextOffsetがcurrentOffsetと等しい場合でも、remainingFilteredRecordsを処理している間、currentOffsetが更新されていない可能性がある）
      const hasMoreKintoneRecordsFromLastOffset = lastKintoneNextOffset !== offset;
      hasMore = (remainingFilteredRecords.length > 0) || (result.hasMore === true) || previousHasMoreKintoneRecords || hasMoreKintoneRecordsFromLastOffset;
      if (hasMore) {
        const previousOffset = currentOffset;
        // kintoneから取得した場合（result.nextOffsetが更新されている場合）、currentOffsetを更新
        // ただし、次のバッチではremainingFilteredRecordsを優先的に処理する
        if (result.nextOffset !== currentOffset && result.nextOffset !== offset) {
          // kintoneから取得した場合、nextOffsetを更新
          currentOffset = result.nextOffset;
          console.log(`[offset更新] kintoneから取得したnextOffsetを使用: ${previousOffset} → ${currentOffset} (残りフィルタ済み=${remainingFilteredRecords.length}件)`);
        } else if (remainingFilteredRecords.length === 0) {
          // 残りレコードがない場合、最後にkintoneから取得したnextOffsetを使用
          // lastKintoneNextOffsetがoffsetと異なる場合、それは最後にkintoneから取得した正しいnextOffset
          // currentOffsetと等しいかどうかに関わらず、lastKintoneNextOffsetを使用する
          if (lastKintoneNextOffset !== offset) {
            // 最後にkintoneから取得したnextOffsetを使用
            // currentOffsetが既にlastKintoneNextOffsetと等しい場合でも、明示的に設定する
            currentOffset = lastKintoneNextOffset;
            if (previousOffset === currentOffset) {
              console.log(`[offset更新] 最後のkintone取得のnextOffsetを使用（既に同じ値）: ${currentOffset}`);
            } else {
              console.log(`[offset更新] 最後のkintone取得のnextOffsetを使用: ${previousOffset} → ${currentOffset}`);
            }
          } else {
            // lastKintoneNextOffsetがoffsetと等しい場合は既に処理済みなので、batchSize分進める
            currentOffset = typeof currentOffset === 'number' ? currentOffset + batchSize : 0;
            console.log(`[offset更新] batchSize分進める: ${previousOffset} → ${currentOffset}`);
          }
        }
        // offsetを進めたので、前回のフラグをリセット
        // ただし、result.hasMoreがtrueの場合は、まだkintoneに残りレコードがあるので保持
        if (result.hasMore !== true) {
          previousHasMoreKintoneRecords = false;
        }
        console.log(`バッチ ${batchCount} 完了: offset ${previousOffset} → ${currentOffset}, 残りフィルタ済み=${remainingFilteredRecords.length}件, hasMore=${hasMore}, kintone残り=${previousHasMoreKintoneRecords || result.hasMore === true ? 'あり' : 'なし'}`);
        
        // offsetが10,000を超える場合は警告
        if (typeof currentOffset === 'number' && currentOffset > 10000) {
          console.warn(`⚠️ offset=${currentOffset}が10,000を超えています。次のバッチでレコードIDベースの取得に切り替わります。`);
        }
      } else {
        console.log(`バッチ ${batchCount} 完了: 次のバッチはありません (offset: ${currentOffset})`);
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
  
  // フィルタリング条件に一致するレコードの総数を集計
  const totalFilteredRecords = allResults.batches.reduce((sum, batch) => {
    // 各バッチのprocessedはフィルタリング後の件数
    return sum + (batch.processed || 0);
  }, 0);
  
  // 重要: ログの表示制限を考慮して、重要な情報のみを出力
  console.log(`=== 全件処理完了 ===`);
  console.log(`処理時間: ${duration}秒`);
  console.log(`バッチ数: ${batchCount}`);
  console.log(`📊 処理したoffset範囲: ${startOffset} → ${endOffset} (kintoneの全レコード中の位置)`);
  console.log(`   開始offset: ${startOffset}`);
  console.log(`   終了offset: ${endOffset}`);
  console.log(`   処理範囲: ${typeof startOffset === 'number' && typeof endOffset === 'number' ? endOffset - startOffset : 'N/A'}件のkintoneレコードを確認`);
  if (allResults.stoppedEarly) {
    console.warn(`⚠️ 警告: 処理が途中で中断されました（理由: ${allResults.stoppedReason || '不明'}）`);
    console.warn(`   タイムアウト（${MAX_EXECUTION_TIME / 1000}秒）またはmaxBatches（${maxBatches}）に達した可能性があります`);
    console.warn(`   残りのレコードを処理するには、次のoffsetから再実行してください: ${currentOffset}`);
  } else if (!hasMore) {
    console.log(`✅ 全レコードの処理が完了しました`);
    console.log(`   次回の実行では、新しいレコードを検出するため、offset=0から開始します`);
  }
  console.log(`フィルタリング条件に一致したレコード総数: ${totalFilteredRecords}件`);
  console.log(`作成: ${allResults.totalCreated}件`);
  if (allResults.totalUpdated > 0) {
    console.log(`更新: ${allResults.totalUpdated}件`);
  }
  console.log(`スキップ: ${allResults.totalSkipped}件`);
  console.log(`失敗: ${allResults.totalFailed}件`);
  
  // 各バッチのフィルタリング結果を集計（ログ行数を節約）
  const batchFilteredCounts = allResults.batches.map(b => ({
    batch: b.batch,
    offset: b.offset,
    processed: b.processed || 0,
  }));
  console.log(`[バッチ別フィルタリング結果] ${JSON.stringify(batchFilteredCounts)}`);
  
  // 警告: 条件に一致するレコードが想定より少ない場合
  // 注意: 1252名が条件に一致するはずなので、それより少ない場合は全レコードを取得できていない可能性がある
  if (totalFilteredRecords < 1000) {
    console.warn(`⚠️ 警告: フィルタリング条件に一致するレコードが${totalFilteredRecords}件しかありません。`);
    console.warn(`   想定される対象者数: 1252名`);
    console.warn(`   差: ${1252 - totalFilteredRecords}件`);
    console.warn(`   全レコードを取得できていない可能性があります。`);
    console.warn(`   フィルタリング条件: '試験対策集中講座（養成）' または '合格パック単体（養成）'`);
  }
  
    const messageParts = [];
    if (allResults.totalCreated > 0) messageParts.push(`作成 ${allResults.totalCreated}件`);
    if (allResults.totalUpdated > 0) messageParts.push(`更新 ${allResults.totalUpdated}件`);
    if (allResults.totalSkipped > 0) messageParts.push(`スキップ ${allResults.totalSkipped}件`);
    if (allResults.totalFailed > 0) messageParts.push(`失敗 ${allResults.totalFailed}件`);
    
    // 全レコードを処理し終わった場合（stoppedEarlyがfalseでhasMoreがfalse）、nextOffsetを0にリセット
    // これにより、次回の実行で新しいレコードが追加されている場合、0から開始して処理できる
    const finalNextOffset = (allResults.stoppedEarly || (batchCount >= maxBatches && hasMore)) 
      ? currentOffset  // タイムアウトやmaxBatchesで止まった場合、続きから処理
      : 0;              // 全レコードを処理し終わった場合、0にリセット（新しいレコードを検出するため）
    
    return Response.json({
    ...allResults,
    message: `全件処理完了: ${batchCount}バッチ処理, 合計 ${messageParts.join(', ')}`,
    stoppedEarly: allResults.stoppedEarly || (batchCount >= maxBatches && hasMore),
    stoppedReason: allResults.stoppedReason || (batchCount >= maxBatches && hasMore ? 'maxBatches' : null),
    nextOffset: finalNextOffset, // 次の実行で使用するoffset（全件処理完了時は0にリセット）
    offsetRange: {
      start: startOffset, // 処理開始時のoffset
      end: endOffset,     // 処理終了時のoffset
      processed: typeof startOffset === 'number' && typeof endOffset === 'number' ? endOffset - startOffset : null, // 処理したkintoneレコード数
      description: `offset ${startOffset} から ${endOffset} まで処理しました（${typeof startOffset === 'number' && typeof endOffset === 'number' ? endOffset - startOffset : 'N/A'}件のkintoneレコードを確認）`,
    },
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


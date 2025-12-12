/**
 * kintoneレコードIDの検索テストAPI
 * 
 * GET /api/test-kintone-record-id?recordId=1470
 * 
 * レスポンス:
 * {
 *   "recordId": "1470",
 *   "found": true,
 *   "user": {...},
 *   "allKintoneRecordIds": ["11", "17", "1250", ...]
 * }
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request) {
  if (!supabaseAdmin) {
    return Response.json(
      { error: 'Supabase Adminクライアントが初期化されていません' },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('recordId');

    if (!recordId) {
      return Response.json(
        { error: 'recordIdパラメータが必要です' },
        { status: 400 }
      );
    }

    const targetRecordId = String(recordId);
    console.log(`[test] 検索対象: recordId=${targetRecordId}, 型=${typeof targetRecordId}`);

    // 全ユーザーを取得
    const allUsers = [];
    let page = 1;
    const perPage = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: page,
        perPage: perPage,
      });

      if (error) {
        throw error;
      }

      if (!data || !data.users || data.users.length === 0) {
        hasMore = false;
        break;
      }

      allUsers.push(...data.users);

      hasMore = data.users.length === perPage;
      page++;

      if (page > 10) {
        break;
      }
    }

    // kintoneレコードIDを持つユーザーを抽出
    const usersWithKintoneId = allUsers.filter(user => user.user_metadata?.kintone_record_id);
    const allKintoneRecordIds = usersWithKintoneId.map(user => {
      const id = user.user_metadata.kintone_record_id;
      return {
        value: id,
        type: typeof id,
        stringValue: String(id),
      };
    });

    // 検索
    const foundUser = usersWithKintoneId.find(user => {
      const userRecordId = user.user_metadata.kintone_record_id;
      const matches = userRecordId === targetRecordId;
      
      // デバッグ: 最初の数件をログ出力
      if (usersWithKintoneId.indexOf(user) < 5) {
        console.log(`[test] サンプル: userRecordId=${userRecordId} (型=${typeof userRecordId}), targetRecordId=${targetRecordId} (型=${typeof targetRecordId}), matches=${matches}`);
      }
      
      return matches;
    });

    // 型の不一致をチェック
    const typeMismatchUsers = usersWithKintoneId.filter(user => {
      const userRecordId = user.user_metadata.kintone_record_id;
      return String(userRecordId) === targetRecordId && userRecordId !== targetRecordId;
    });

    return Response.json({
      recordId: targetRecordId,
      recordIdType: typeof targetRecordId,
      found: !!foundUser,
      user: foundUser ? {
        id: foundUser.id,
        email: foundUser.email,
        kintone_record_id: foundUser.user_metadata.kintone_record_id,
        kintone_record_id_type: typeof foundUser.user_metadata.kintone_record_id,
      } : null,
      totalUsers: allUsers.length,
      usersWithKintoneId: usersWithKintoneId.length,
      typeMismatchCount: typeMismatchUsers.length,
      typeMismatchUsers: typeMismatchUsers.slice(0, 5).map(user => ({
        email: user.email,
        kintone_record_id: user.user_metadata.kintone_record_id,
        kintone_record_id_type: typeof user.user_metadata.kintone_record_id,
        stringValue: String(user.user_metadata.kintone_record_id),
      })),
      sampleKintoneRecordIds: allKintoneRecordIds.slice(0, 10),
    });
  } catch (error) {
    console.error('テストエラー:', error);
    return Response.json(
      { error: error.message || 'テストに失敗しました' },
      { status: 500 }
    );
  }
}


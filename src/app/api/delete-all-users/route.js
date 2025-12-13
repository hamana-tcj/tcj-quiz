/**
 * Supabase Authの全ユーザーを削除するAPI
 * 
 * POST /api/delete-all-users
 * 
 * リクエストボディ（JSON）:
 * {
 *   "confirm": true,  // 必須: 削除を確認するフラグ
 *   "dryRun": false   // オプション: trueの場合、実際には削除せずに削除対象を返す
 * }
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "totalUsers": 552,
 *   "deleted": 552,
 *   "failed": 0,
 *   "errors": [],
 *   "message": "全ユーザーの削除が完了しました"
 * }
 * 
 * 注意: このAPIは非常に危険です。実行前に必ずバックアップを取得してください。
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request) {
  if (!supabaseAdmin) {
    return Response.json(
      { error: 'Supabase Adminクライアントが初期化されていません' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { confirm, dryRun = false } = body;

    // 確認フラグのチェック
    if (confirm !== true) {
      return Response.json(
        { 
          error: '削除を確認するには、リクエストボディに "confirm": true を指定してください',
          warning: 'この操作は取り消せません。実行前に必ずバックアップを取得してください。'
        },
        { status: 400 }
      );
    }

    console.log('=== 全ユーザー削除処理開始 ===');
    console.log('開始時刻:', new Date().toISOString());
    console.log('dryRun:', dryRun);

    // 全ユーザーを取得（ページネーション対応）
    const allUsers = [];
    let page = 1;
    let hasMore = true;
    const perPage = 1000; // Supabaseのデフォルト最大値

    while (hasMore && page <= 10) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: page,
        perPage: perPage,
      });

      if (error) {
        throw error;
      }

      if (data.users && data.users.length > 0) {
        allUsers.push(...data.users);
        page++;
        
        // 取得件数がperPageより少ない場合は終了
        if (data.users.length < perPage) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`全ユーザー取得完了: ${allUsers.length}件`);

    if (allUsers.length === 0) {
      return Response.json({
        success: true,
        totalUsers: 0,
        deleted: 0,
        failed: 0,
        errors: [],
        message: '削除対象のユーザーがありません',
      });
    }

    // dryRunモードの場合、削除せずに削除対象を返す
    if (dryRun) {
      const userList = allUsers.map(user => ({
        id: user.id,
        email: user.email,
        kintone_record_id: user.user_metadata?.kintone_record_id || null,
        created_at: user.created_at,
      }));

      return Response.json({
        success: true,
        dryRun: true,
        totalUsers: allUsers.length,
        users: userList,
        message: `削除対象: ${allUsers.length}件（dryRunモードのため実際には削除していません）`,
      });
    }

    // 実際の削除処理
    const deletedUsers = [];
    const failedUsers = [];
    const errors = [];

    console.log(`削除処理を開始します: ${allUsers.length}件`);

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      
      try {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        
        if (deleteError) {
          console.error(`ユーザー削除エラー (${user.email}):`, deleteError);
          failedUsers.push({
            id: user.id,
            email: user.email,
            error: deleteError.message || '削除に失敗しました',
          });
          errors.push({
            userId: user.id,
            email: user.email,
            error: deleteError.message || '削除に失敗しました',
          });
        } else {
          deletedUsers.push({
            id: user.id,
            email: user.email,
          });
          
          // 進捗をログに出力（10件ごと）
          if ((i + 1) % 10 === 0 || i === allUsers.length - 1) {
            console.log(`削除進捗: ${i + 1}/${allUsers.length}件 (成功: ${deletedUsers.length}件, 失敗: ${failedUsers.length}件)`);
          }
        }
      } catch (error) {
        console.error(`ユーザー削除例外 (${user.email}):`, error);
        failedUsers.push({
          id: user.id,
          email: user.email,
          error: error.message || '削除中に例外が発生しました',
        });
        errors.push({
          userId: user.id,
          email: user.email,
          error: error.message || '削除中に例外が発生しました',
        });
      }
    }

    console.log(`削除処理完了: 成功=${deletedUsers.length}件, 失敗=${failedUsers.length}件`);

    const result = {
      success: failedUsers.length === 0,
      totalUsers: allUsers.length,
      deleted: deletedUsers.length,
      failed: failedUsers.length,
      errors: errors,
      message: failedUsers.length === 0
        ? `全ユーザー（${deletedUsers.length}件）の削除が完了しました`
        : `${deletedUsers.length}件のユーザーを削除しましたが、${failedUsers.length}件の削除に失敗しました`,
    };

    if (failedUsers.length > 0) {
      result.failedUsers = failedUsers;
    }

    return Response.json(result);
  } catch (error) {
    console.error('全ユーザー削除エラー:', error);
    return Response.json(
      { 
        error: error.message || '全ユーザーの削除に失敗しました',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}


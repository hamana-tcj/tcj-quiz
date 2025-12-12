/**
 * Supabase Authの全ユーザーを取得するAPI（デバッグ用）
 * 
 * GET /api/list-all-users
 * 
 * レスポンス:
 * {
 *   "total": 100,
 *   "users": [...],
 *   "usersWithKintoneId": [...],
 *   "usersWithoutKintoneId": [...]
 * }
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export async function GET(request) {
  if (!supabaseAdmin) {
    return Response.json(
      { error: 'Supabase Adminクライアントが初期化されていません' },
      { status: 500 }
    );
  }

  try {
    // 全ユーザーを取得（ページネーション対応）
    const allUsers = [];
    let page = 1;
    let hasMore = true;
    const perPage = 1000; // Supabaseのデフォルト最大値

    while (hasMore) {
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

    // kintoneレコードIDで分類
    const usersWithKintoneId = allUsers.filter(user => 
      user.user_metadata?.kintone_record_id
    );
    const usersWithoutKintoneId = allUsers.filter(user => 
      !user.user_metadata?.kintone_record_id
    );

    return Response.json({
      total: allUsers.length,
      usersWithKintoneId: usersWithKintoneId.length,
      usersWithoutKintoneId: usersWithoutKintoneId.length,
      users: allUsers.map(user => ({
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        updated_at: user.updated_at,
        email_confirmed_at: user.email_confirmed_at,
        kintone_record_id: user.user_metadata?.kintone_record_id || null,
        is_initial_password: user.user_metadata?.is_initial_password || false,
      })),
      // デバッグ用: kintoneレコードIDがあるユーザーのみ
      usersWithKintoneIdDetails: usersWithKintoneId.map(user => ({
        id: user.id,
        email: user.email,
        kintone_record_id: user.user_metadata?.kintone_record_id,
        created_at: user.created_at,
      })),
      // デバッグ用: kintoneレコードIDがないユーザーのみ
      usersWithoutKintoneIdDetails: usersWithoutKintoneId.map(user => ({
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      })),
    });
  } catch (error) {
    console.error('ユーザー一覧取得エラー:', error);
    return Response.json(
      { error: error.message || 'ユーザー一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}



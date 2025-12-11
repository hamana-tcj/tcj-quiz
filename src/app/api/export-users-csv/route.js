/**
 * Supabase Authの全ユーザーをCSV形式でエクスポートするAPI
 * 
 * GET /api/export-users-csv
 * 
 * クエリパラメータ（オプション）:
 * - format: 'simple' (メールアドレスのみ) または 'full' (メールアドレス + kintoneレコードID) (デフォルト: 'simple')
 * 
 * レスポンス:
 * - Content-Type: text/csv
 * - Content-Disposition: attachment; filename="users-YYYY-MM-DD.csv"
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
    // クエリパラメータを取得
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'simple'; // 'simple' または 'full'

    // 全ユーザーを取得（ページネーション対応）
    const allUsers = [];
    let page = 1;
    let hasMore = true;
    const perPage = 1000; // Supabaseのデフォルト最大値

    console.log('=== ユーザーエクスポート処理開始 ===');
    console.log('開始時刻:', new Date().toISOString());
    console.log('フォーマット:', format);

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

    console.log(`全ユーザー取得完了: ${allUsers.length}件`);

    // CSV形式に変換
    let csvContent = '';
    
    if (format === 'full') {
      // フル形式: メールアドレス + kintoneレコードID
      csvContent = 'email,kintone_record_id\n';
      for (const user of allUsers) {
        const email = user.email || '';
        const kintoneRecordId = user.user_metadata?.kintone_record_id || '';
        // CSV形式でエスケープ（カンマや改行を含む場合）
        const escapedEmail = email.includes(',') || email.includes('"') || email.includes('\n')
          ? `"${email.replace(/"/g, '""')}"`
          : email;
        csvContent += `${escapedEmail},${kintoneRecordId}\n`;
      }
    } else {
      // シンプル形式: メールアドレスのみ
      csvContent = 'email\n';
      for (const user of allUsers) {
        const email = user.email || '';
        // CSV形式でエスケープ（カンマや改行を含む場合）
        const escapedEmail = email.includes(',') || email.includes('"') || email.includes('\n')
          ? `"${email.replace(/"/g, '""')}"`
          : email;
        csvContent += `${escapedEmail}\n`;
      }
    }

    // ファイル名を生成（現在の日付を含む）
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `users-${today}.csv`;

    console.log(`CSV生成完了: ${allUsers.length}件, ファイル名: ${filename}`);

    // CSV形式でレスポンスを返す
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('ユーザーエクスポートエラー:', error);
    return Response.json(
      { error: error.message || 'ユーザーのエクスポートに失敗しました' },
      { status: 500 }
    );
  }
}


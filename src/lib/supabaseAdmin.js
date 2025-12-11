/**
 * Supabase Admin API用クライアント
 * 
 * 環境変数:
 * - NEXT_PUBLIC_SUPABASE_URL: Supabase URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key（Admin API用）
 * 
 * 注意: Service Role Keyはサーバーサイドでのみ使用してください
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase Admin環境変数が設定されていません', {
    hasUrl: !!SUPABASE_URL,
    hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
    urlLength: SUPABASE_URL?.length || 0,
    keyLength: SUPABASE_SERVICE_ROLE_KEY?.length || 0,
  });
}

// Service Role Keyを使用したAdminクライアント
export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * ランダムな仮パスワードを生成
 * @param {number} length - パスワードの長さ（デフォルト: 32）
 * @returns {string} 生成されたパスワード
 */
export function generateTempPassword(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  // Node.js環境での安全なランダム生成
  if (typeof require !== 'undefined') {
    try {
      const crypto = require('crypto');
      const randomBytes = crypto.randomBytes(length);
      for (let i = 0; i < length; i++) {
        password += chars[randomBytes[i] % chars.length];
      }
    } catch (e) {
      // フォールバック
      for (let i = 0; i < length; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
      }
    }
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // ブラウザ環境
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      password += chars[array[i] % chars.length];
    }
  } else {
    // フォールバック
    for (let i = 0; i < length; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  
  return password;
}

/**
 * ユーザーが既に存在するかチェック
 * @param {string} email - メールアドレス
 * @returns {Promise<boolean>} 存在する場合はtrue
 */
export async function userExists(email) {
  if (!supabaseAdmin) {
    const errorMsg = 'Supabase Adminクライアントが初期化されていません。';
    const details = {
      hasUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      urlLength: SUPABASE_URL?.length || 0,
      keyLength: SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    };
    console.error(errorMsg, details);
    throw new Error(`${errorMsg} 環境変数SUPABASE_SERVICE_ROLE_KEYが設定されているか確認してください。`);
  }

  try {
    // メールアドレスを小文字に正規化して比較（大文字小文字を区別しない）
    const normalizedEmail = email?.toLowerCase().trim();
    
    // SupabaseのlistUsers()はページネーションを使用するため、全ユーザーを取得する必要がある
    // 最大1000件ずつ取得して、全ユーザーをチェック
    let page = 1;
    const perPage = 1000;
    let hasMore = true;
    let totalChecked = 0;
    
    while (hasMore) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: page,
        perPage: perPage,
      });
      
      if (error) {
        console.error(`[userExists] ページ${page}の取得エラー:`, error);
        throw error;
      }

      // データが空の場合は終了
      if (!data || !data.users || data.users.length === 0) {
        hasMore = false;
        break;
      }

      totalChecked += data.users.length;

      // 現在のページでユーザーを検索
      const found = data.users.some(user => {
        const userEmail = user.email?.toLowerCase().trim();
        return userEmail === normalizedEmail;
      });
      
      if (found) {
        console.log(`[userExists] ユーザー発見: email=${normalizedEmail}, チェック件数=${totalChecked}件`);
        return true;
      }

      // 次のページがあるかチェック
      // SupabaseのlistUsers()は、取得したユーザー数がperPage未満の場合、次のページがないことを示す
      hasMore = data.users.length === perPage;
      page++;
      
      // 安全のため、最大10ページ（10,000件）までチェック
      if (page > 10) {
        console.warn(`⚠️ 警告: userExistsで10,000件を超えるユーザーをチェックしました。email=${normalizedEmail}, チェック件数=${totalChecked}件`);
        break;
      }
    }
    
    console.log(`[userExists] ユーザー未発見: email=${normalizedEmail}, チェック件数=${totalChecked}件`);
    return false;
  } catch (error) {
    console.error('ユーザー存在チェックエラー:', error);
    throw error;
  }
}

/**
 * Supabaseにユーザーを作成（仮パスワード設定）
 * @param {string} email - メールアドレス
 * @param {string} tempPassword - 仮パスワード（指定しない場合は自動生成）
 * @param {string} kintoneRecordId - kintoneレコードID（オプション）
 * @returns {Promise<Object>} 作成されたユーザー情報
 */
export async function createUserWithTempPassword(email, tempPassword = null, kintoneRecordId = null) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  // 既存ユーザーチェック
  const exists = await userExists(email);
  if (exists) {
    throw new Error(`ユーザー ${email} は既に存在します`);
  }

  // 仮パスワード生成
  const password = tempPassword || generateTempPassword();

  // メタデータを構築
  const userMetadata = {
    is_initial_password: true, // 初回ログイン判定用フラグ
  };
  
  // kintoneレコードIDをメタデータに追加
  if (kintoneRecordId) {
    userMetadata.kintone_record_id = kintoneRecordId;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // メール確認済みとして設定
      user_metadata: userMetadata,
    });

    if (error) {
      throw error;
    }

    return {
      user: data.user,
      tempPassword: password, // ログ用（実際には返さない方が安全）
    };
  } catch (error) {
    console.error('ユーザー作成エラー:', error);
    throw error;
  }
}

/**
 * 複数のユーザーを一括作成
 * @param {Array<string>|Array<Object>} emailsOrRecords - メールアドレス配列、または{email, kintoneRecordId}の配列
 * @param {boolean} skipExistenceCheck - 既存ユーザーチェックをスキップするか（デフォルト: false）
 * @returns {Promise<Object>} 作成結果
 */
export async function createUsersBatch(emailsOrRecords, skipExistenceCheck = false) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  const results = {
    success: [],
    failed: [],
    skipped: [],
  };

  // メールアドレス配列か、レコードオブジェクト配列かを判定
  const records = emailsOrRecords.map(item => {
    if (typeof item === 'string') {
      return { email: item, kintoneRecordId: null };
    }
    return item;
  });

  for (const record of records) {
    const { email, kintoneRecordId } = record;
    
    try {
      // メールアドレスを正規化
      const normalizedEmail = email?.toLowerCase().trim();
      
      // 既存ユーザーチェック（skipExistenceCheckがfalseの場合のみ）
      if (!skipExistenceCheck) {
        const exists = await userExists(normalizedEmail);
        if (exists) {
          results.skipped.push({ email: normalizedEmail, reason: '既に存在します' });
          continue;
        }
      }

      // メタデータを構築
      const userMetadata = {
        is_initial_password: true,
      };
      
      // kintoneレコードIDをメタデータに追加
      if (kintoneRecordId) {
        userMetadata.kintone_record_id = String(kintoneRecordId);
      }

      console.log(`[ユーザー作成試行] email=${normalizedEmail}, recordId=${kintoneRecordId || 'なし'}, skipCheck=${skipExistenceCheck}`);
      
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: generateTempPassword(),
        email_confirm: true,
        user_metadata: userMetadata,
      });

      if (error) {
        // 既存ユーザーエラーの場合はスキップとして扱う
        const errorMessage = error.message || '';
        const errorCode = error.code || error.status || '';
        console.log(`[Supabase API エラー] email=${normalizedEmail}, code=${errorCode}, message=${errorMessage}`);
        
        if (errorMessage.includes('already been registered') ||
            errorMessage.includes('already exists') ||
            errorMessage.includes('User already registered') ||
            errorMessage.includes('duplicate') ||
            errorMessage.includes('email already') ||
            errorCode === 'user_already_registered' ||
            errorCode === 'duplicate_email') {
          console.log(`[既存ユーザー検出] email=${normalizedEmail} (作成時にエラーから検出: code=${errorCode}, message=${errorMessage})`);
          results.skipped.push({ 
            email: normalizedEmail, 
            reason: `既に存在します（作成時に検出: ${errorMessage})`,
          });
          continue;
        }
        // その他のエラーは失敗として扱う
        console.error(`[ユーザー作成エラー] email=${normalizedEmail}, code=${errorCode}, error=${errorMessage}`);
        throw error;
      }

      console.log(`[ユーザー作成成功] email=${normalizedEmail}, userId=${data.user.id}, recordId=${kintoneRecordId || 'なし'}`);
      results.success.push({ email: normalizedEmail, userId: data.user.id, kintoneRecordId });
    } catch (error) {
      // 既存ユーザーエラーの場合はスキップとして扱う
      if (error.message && (
        error.message.includes('already been registered') ||
        error.message.includes('already exists') ||
        error.message.includes('User already registered')
      )) {
        results.skipped.push({ 
          email: email?.toLowerCase().trim() || email, 
          reason: '既に存在します（エラーから検出）',
        });
      } else {
        results.failed.push({ 
          email: email?.toLowerCase().trim() || email, 
          error: error.message || '不明なエラー',
        });
      }
    }
  }

  return results;
}

/**
 * メールアドレスでユーザーを検索
 * @param {string} email - メールアドレス
 * @returns {Promise<Object|null>} ユーザー情報（存在しない場合はnull）
 */
export async function getUserByEmail(email) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      throw error;
    }

    const user = data.users.find(user => user.email === email);
    return user || null;
  } catch (error) {
    console.error('ユーザー検索エラー:', error);
    throw error;
  }
}

/**
 * kintoneレコードIDでユーザーを検索
 * @param {string} kintoneRecordId - kintoneレコードID
 * @returns {Promise<Object|null>} ユーザー情報（存在しない場合はnull）
 */
export async function getUserByKintoneRecordId(kintoneRecordId) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  if (!kintoneRecordId) {
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      throw error;
    }

    const user = data.users.find(user => 
      user.user_metadata?.kintone_record_id === String(kintoneRecordId)
    );
    return user || null;
  } catch (error) {
    console.error('ユーザー検索エラー（kintoneレコードID）:', error);
    throw error;
  }
}

/**
 * ユーザーのメールアドレスを更新
 * @param {string} userId - ユーザーID
 * @param {string} newEmail - 新しいメールアドレス
 * @returns {Promise<Object>} 更新されたユーザー情報
 */
export async function updateUserEmail(userId, newEmail) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true, // メール確認済みとして設定
    });

    if (error) {
      throw error;
    }

    console.log(`ユーザー ${userId} のメールアドレスを ${newEmail} に更新しました`);
    return data.user;
  } catch (error) {
    console.error('メールアドレス更新エラー:', error);
    throw error;
  }
}

/**
 * ユーザーを削除
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 削除成功時はtrue
 */
export async function deleteUser(userId) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('ユーザー削除エラー:', error);
    throw error;
  }
}

/**
 * メールアドレスでユーザーを削除
 * @param {string} email - メールアドレス
 * @returns {Promise<boolean>} 削除成功時はtrue、ユーザーが存在しない場合はfalse
 */
export async function deleteUserByEmail(email) {
  const user = await getUserByEmail(email);
  
  if (!user) {
    return false; // ユーザーが存在しない
  }

  return await deleteUser(user.id);
}

/**
 * 複数のユーザーを一括削除
 * @param {Array<string>} emails - メールアドレス配列
 * @returns {Promise<Object>} 削除結果
 */
export async function deleteUsersBatch(emails) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  const results = {
    success: [],
    failed: [],
    notFound: [],
  };

  for (const email of emails) {
    try {
      const deleted = await deleteUserByEmail(email);
      
      if (deleted) {
        results.success.push({ email });
      } else {
        results.notFound.push({ email, reason: 'ユーザーが存在しません' });
      }
    } catch (error) {
      results.failed.push({ 
        email, 
        error: error.message || '不明なエラー',
      });
    }
  }

  return results;
}


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
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      throw error;
    }

    return data.users.some(user => user.email === email);
  } catch (error) {
    console.error('ユーザー存在チェックエラー:', error);
    throw error;
  }
}

/**
 * Supabaseにユーザーを作成（仮パスワード設定）
 * @param {string} email - メールアドレス
 * @param {string} tempPassword - 仮パスワード（指定しない場合は自動生成）
 * @returns {Promise<Object>} 作成されたユーザー情報
 */
export async function createUserWithTempPassword(email, tempPassword = null) {
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

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // メール確認済みとして設定
      user_metadata: {
        is_initial_password: true, // 初回ログイン判定用フラグ
      },
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
 * @param {Array<string>} emails - メールアドレス配列
 * @returns {Promise<Object>} 作成結果
 */
export async function createUsersBatch(emails) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Adminクライアントが初期化されていません');
  }

  const results = {
    success: [],
    failed: [],
    skipped: [],
  };

  for (const email of emails) {
    try {
      const exists = await userExists(email);
      if (exists) {
        results.skipped.push({ email, reason: '既に存在します' });
        continue;
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: generateTempPassword(),
        email_confirm: true,
        user_metadata: {
          is_initial_password: true,
        },
      });

      if (error) {
        throw error;
      }

      results.success.push({ email, userId: data.user.id });
    } catch (error) {
      results.failed.push({ 
        email, 
        error: error.message || '不明なエラー',
      });
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


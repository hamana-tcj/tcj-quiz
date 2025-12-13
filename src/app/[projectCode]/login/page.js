'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import HeaderImage from '@/components/ui/HeaderImage';

export default function LoginPage() {
  const { projectCode } = useParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordResetPopup, setShowPasswordResetPopup] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');
  const [loginError, setLoginError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setLoginError(''); // エラーメッセージをリセット
    
    // メールアドレスまたはパスワードが空欄の場合は、HTML5のバリデーションに任せる
    if (!email.trim() || !password.trim()) {
      return;
    }
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // エラーメッセージを日本語に変換
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('invalid login credentials') || 
          errorMessage.includes('invalid credentials') ||
          errorMessage.includes('email not confirmed') ||
          errorMessage.includes('wrong password') ||
          errorMessage.includes('user not found')) {
        setLoginError('メールアドレスかパスワードが間違っています');
      } else {
        setLoginError(`ログインエラー: ${error.message}`);
      }
      return;
    }
    
    // ログイン成功
    router.push(`/${projectCode}/subjects`);
  }

  async function handlePasswordReset(e) {
    e.preventDefault();
    setResetError('');
    setResetMsg('');

    // メールアドレスが空欄の場合
    if (!resetEmail.trim()) {
      setResetError('メールアドレスを入力してください');
      return;
    }

    // メールアドレスがSupabase AUTHに登録されているかチェック
    // SupabaseのresetPasswordForEmailを使用して、エラーメッセージで判定
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/${projectCode}/set-password`,
      });

      if (resetError) {
        // エラーメッセージから登録されていないか判定
        const errorMsg = resetError.message.toLowerCase();
        if (errorMsg.includes('not found') || errorMsg.includes('not registered') || 
            errorMsg.includes('does not exist') || errorMsg.includes('user not found') ||
            errorMsg.includes('email not found') || errorMsg.includes('user does not exist')) {
          setResetError('そのメールアドレスは登録されていません');
        } else {
          setResetError(`エラー：${resetError.message}`);
        }
        return;
      }

      // 成功した場合
      // 注意: Supabaseはセキュリティ上の理由から、存在しないメールでも成功を返すことがあります
      // しかし、エラーが返された場合は確実に存在しないと判断できます
      setResetMsg('パスワード設定用のURLをメールアドレスに送信しました。');
      setTimeout(() => {
        setShowPasswordResetPopup(false);
        setResetEmail('');
        setResetMsg('');
      }, 2000);
    } catch (err) {
      // エラーが発生した場合のフォールバック
      console.error('Password reset error:', err);
      setResetError('エラーが発生しました。もう一度お試しください。');
    }
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex-1">
        <HeaderImage
          src="/logo.png"
          alt="ログイン"
          contentMaxWidth="max-w-md"
        />
        <div className="p-6 max-w-md mx-auto">

          <form onSubmit={onSubmit} className="space-y-4">
          {/* メールアドレス */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
              メールアドレス
            </label>
            <input
              type="email"
              placeholder="MYページログイン時と同じメールアドレス"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLoginError(''); // 入力時にエラーメッセージをクリア
              }}
              className="w-full border rounded p-2"
              required
            />
          </div>

          {/* パスワード */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
              パスワード
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="初回ログインの際は「新規登録」より発行"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLoginError(''); // 入力時にエラーメッセージをクリア
                }}
                className="w-full border rounded p-2 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* ログインエラーメッセージ */}
          {loginError && (
            <div className="text-sm text-red-600" role="alert">
              {loginError}
            </div>
          )}

          {/* ログインボタン */}
          <button 
            type="submit" 
            className="w-full rounded-lg text-white font-bold text-lg py-4 shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: 'var(--bg-button)' }}
          >
            ログイン
          </button>

          {/* 初回ログイン・パスワードを忘れた方 */}
          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setShowPasswordResetPopup(true);
                setResetEmail(email); // ログイン画面のメールアドレスを初期値として設定
                setResetError('');
                setResetMsg('');
              }}
              className="text-sm"
              style={{ color: 'var(--bg-button)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              新規登録・パスワードを忘れた方はこちら
            </button>
          </div>
        </form>
        </div>
      </div>

      {/* パスワードリセットポップアップ */}
      {showPasswordResetPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary-transparent)' }}>
          <div className="rounded-lg p-6 max-w-md w-full mx-4" style={{ maxWidth: '400px', background: 'var(--bg-white)' }}>
            <div className="mb-4">
              <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                パスワード設定用のURLを記載したメールを送ります。
              </p>
              <div className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                <p className="mb-1">件名：【パスワード設定】「一問一答1500」日本語教員試験 短期合格パック</p>
                <p className="mb-1">差出人：Supabase Auth</p>
                <p className="mb-1">でパスワード変更サイトのリンク付メールが送信されます。</p>
                <p className="mb-1">メールが届かない場合は迷惑メールフォルダもご確認ください。</p>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                MYページログイン時のアドレスを入力してください
              </p>
            </div>
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                  メールアドレス
                </label>
                <input
                  type="email"
                  placeholder="MYページログイン時と同じメールアドレス"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full border rounded p-2"
                  required
                />
              </div>

              {resetError && (
                <p className="text-sm text-red-600">{resetError}</p>
              )}

              {resetMsg && (
                <p className="text-sm text-green-600">{resetMsg}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordResetPopup(false);
                    setResetEmail('');
                    setResetError('');
                    setResetMsg('');
                  }}
                  className="flex-1 border rounded-lg py-2 text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg text-white font-bold py-2 shadow-lg hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--bg-button)' }}
                >
                  {resetMsg ? 'OK' : '送信'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* コピーライト */}
      <div className="text-center pb-6">
        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
          © TCJ Global Inc.
        </p>
      </div>
    </main>
  );
}

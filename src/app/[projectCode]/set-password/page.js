'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import HeaderImage from '@/components/ui/HeaderImage';

export default function SetPasswordPage() {
  const { projectCode } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscription = null;

    const initializeAuth = async () => {
      // エラーパラメータをチェック（URLフラグメントまたはクエリパラメータ）
      const hash = window.location.hash;
      const searchParams = new URLSearchParams(window.location.search);
      
      // フラグメントからエラーパラメータを取得
      let errorParam = null;
      let errorCode = null;
      let errorDescription = null;
      
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        errorParam = hashParams.get('error');
        errorCode = hashParams.get('error_code');
        errorDescription = hashParams.get('error_description');
      }
      
      // クエリパラメータからもエラーパラメータを取得
      if (!errorParam) {
        errorParam = searchParams.get('error');
        errorCode = searchParams.get('error_code');
        errorDescription = searchParams.get('error_description');
      }
      
      if (errorParam) {
        setLoading(false);
        if (errorCode === 'otp_expired') {
          setError('メールリンクの有効期限が切れています。再度パスワードリセットメールを送信してください。');
        } else if (errorCode === 'access_denied') {
          setError('アクセスが拒否されました。再度パスワードリセットメールを送信してください。');
        } else {
          setError(errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : 'エラーが発生しました。再度パスワードリセットメールを送信してください。');
        }
        return;
      }

      // フラグメントからトークンを処理
      if (hash && hash.includes('access_token')) {
        console.log('Hash fragment detected, processing...');
        
        // Supabaseの認証状態変更を監視（フラグメント処理を待つ）
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('Auth state changed:', event, session ? 'has session' : 'no session');
          
          if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
            if (session) {
              setLoading(false);
              // フラグメントをURLから削除（セキュリティのため）
              if (window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
              }
              console.log('Session established for password recovery');
            } else {
              setLoading(false);
              setError('無効なリンクです。再度パスワードリセットメールを送信してください。');
            }
          } else if (event === 'SIGNED_OUT') {
            setLoading(false);
            setError('セッションが無効です。再度パスワードリセットメールを送信してください。');
          }
        });
        
        subscription = authSubscription;
        
        // フラグメントが処理されるまで待つ（最大3秒）
        let attempts = 0;
        const maxAttempts = 30; // 3秒（100ms × 30）
        let sessionFound = false;
        
        while (!sessionFound && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (session) {
            sessionFound = true;
            setLoading(false);
            // フラグメントをURLから削除
            if (window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            break;
          }
          
          if (sessionError) {
            setLoading(false);
            setError('エラーが発生しました。再度パスワードリセットメールを送信してください。');
            break;
          }
          
          attempts++;
        }
        
        if (!sessionFound && attempts >= maxAttempts) {
          setLoading(false);
          setError('セッションの確立に時間がかかりすぎました。再度パスワードリセットメールを送信してください。');
        }
      } else {
        // フラグメントがない場合、既存のセッションを確認
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
            setLoading(false);
            if (!session) {
              setError('無効なリンクです。再度パスワードリセットメールを送信してください。');
            }
          }
        });
        
        subscription = authSubscription;
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          setLoading(false);
          setError('エラーが発生しました。再度パスワードリセットメールを送信してください。');
          return;
        }
        
        if (session) {
          setLoading(false);
        } else {
          setLoading(false);
          setError('無効なリンクです。再度パスワードリセットメールを送信してください。');
        }
      }
    };

    initializeAuth();

    // クリーンアップ関数
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  async function handleSetPassword(e) {
    e.preventDefault();
    setError('');
    setMsg('');

    // バリデーション
    if (!password.trim()) {
      setError('パスワードを入力してください');
      return;
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    setMsg('パスワードを設定中…');

    try {
      // パスワードを更新
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        // エラーメッセージを日本語に変換
        let errorMessage = updateError.message;
        if (errorMessage.includes('New password should be different from the old password')) {
          errorMessage = '新しいパスワードは現在のパスワードと異なる必要があります';
        }
        setError(`エラー：${errorMessage}`);
        setMsg('');
        return;
      }

      // 成功した場合
      setMsg('パスワードを設定しました。ログイン画面に移動します...');
      setTimeout(() => {
        router.push(`/${projectCode}/login`);
      }, 2000);
    } catch (err) {
      console.error('Set password error:', err);
      setError('エラーが発生しました。もう一度お試しください。');
      setMsg('');
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'rgba(231, 238, 251, 0.9)' }}>
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'rgba(231, 238, 251, 0.9)' }}>
      <div className="flex-1">
        <HeaderImage
          src="/logo.png"
          alt="パスワード設定"
          contentMaxWidth="max-w-md"
        />
        <div className="p-6 max-w-md mx-auto">
          <form onSubmit={handleSetPassword} className="space-y-4">
            {/* パスワード */}
            <div>
              <label className="block text-sm mb-2" style={{ color: '#7a797a' }}>
                新しいパスワード
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="新しいパスワード"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded p-2 pr-10"
                  required
                  minLength={6}
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

            {/* パスワード確認 */}
            <div>
              <label className="block text-sm mb-2" style={{ color: '#7a797a' }}>
                パスワード（確認）
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="パスワード（確認）"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border rounded p-2 pr-10"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                  {showConfirmPassword ? (
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

            {/* エラーメッセージ */}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            {/* 成功メッセージ */}
            {msg && (
              <p className="text-sm text-green-600">{msg}</p>
            )}

            {/* 設定ボタン */}
            <button 
              type="submit" 
              className="w-full rounded-lg text-white font-bold text-lg py-4 shadow-lg hover:opacity-90 transition-opacity"
              style={{ background: '#5170ff' }}
              disabled={!!msg && msg.includes('ログイン画面に移動')}
            >
              パスワードを設定
            </button>
          </form>
        </div>
      </div>

      {/* コピーライト */}
      <div className="text-center pb-6">
        <p className="text-xs text-black">
          © TCJ Global Inc.
        </p>
      </div>
    </main>
  );
}


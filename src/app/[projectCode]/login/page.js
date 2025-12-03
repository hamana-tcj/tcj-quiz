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
  const [msg, setMsg] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setMsg('サインイン中…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(`失敗：${error.message}`);
    setMsg('成功！');
    router.push(`/${projectCode}/subjects`);
  }

  return (
    <main className="min-h-screen" style={{ background: '#e7eefb' }}>
      <HeaderImage
        src="/logo.png"
        alt="ログイン"
        contentMaxWidth="max-w-md"
      />
      <div className="p-6 max-w-md mx-auto">

        <form onSubmit={onSubmit} className="space-y-4">
          {/* メールアドレス */}
          <div>
            <label className="block text-sm mb-2" style={{ color: '#7a797a' }}>
              メールアドレス
            </label>
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded p-2"
              required
            />
          </div>

          {/* パスワード */}
          <div>
            <label className="block text-sm mb-2" style={{ color: '#7a797a' }}>
              パスワード
            </label>
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded p-2"
              required
            />
          </div>

          {/* ログインボタン */}
          <button 
            type="submit" 
            className="w-full rounded-lg text-white font-bold text-lg py-4 shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: '#5170ff' }}
          >
            ログイン
          </button>

          {/* 初回ログイン・パスワードを忘れた方 */}
          <div className="text-right">
            <a 
              href="#" 
              className="text-sm"
              style={{ color: '#5170ff' }}
            >
              初回ログイン・パスワードを忘れた方はこちら
            </a>
          </div>
        </form>

        {msg && <p className="mt-3 text-sm text-center">{msg}</p>}
      </div>
    </main>
  );
}

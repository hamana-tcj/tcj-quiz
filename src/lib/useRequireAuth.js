'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

/**
 * 認証必須ページ用の共通フック
 * - セッションがなければ redirectPath にリダイレクト
 * - 認証中 or リダイレクト中は loadingAuth が true
 */
export function useRequireAuth(redirectPath = '/login') {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (cancelled) return;

      if (error) {
        console.error('auth check error:', error);
        // 認証エラーの場合もログイン画面へ
        router.replace(redirectPath);
        setLoadingAuth(false);
        return;
      }

      const session = data?.session;
      if (!session) {
        router.replace(redirectPath);
      } else {
        setUser(session.user);
      }
      setLoadingAuth(false);
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [router, redirectPath]);

  return { user, loadingAuth };
}

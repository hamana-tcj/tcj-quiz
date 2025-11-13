'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const { projectCode } = useParams(); // 例: "tcj"
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/${projectCode}/login`);
        return;
      }
      setUser(session.user);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace(`/${projectCode}/login`);
    });
    return () => sub.subscription.unsubscribe();
  }, [projectCode, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace(`/${projectCode}/login`);
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">ダッシュボード ({projectCode})</h1>
      <p className="mt-3">ようこそ{user ? `、${user.email}` : ''}。</p>
      <div className="mt-6 flex gap-3">
        <button onClick={signOut} className="rounded bg-black text-white px-4 py-2">
          サインアウト
        </button>
      </div>
      <p className="mt-4"><a href={`/${projectCode}/subjects`} className="underline">▶ 科目一覧へ</a></p>
    </main>
  );
}

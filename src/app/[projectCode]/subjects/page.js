'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SubjectsPage() {
  const { projectCode } = useParams();
  const router = useRouter();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      // ログイン確認
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/${projectCode}/login`);
        return;
      }
      // 科目取得
      const { data, error } = await supabase
        .from('subjects')
        .select('id,name')
        .order('created_at', { ascending: true });

      if (error) setErr(error.message);
      else setSubjects(data || []);
      setLoading(false);
    })();
  }, [projectCode, router]);

  if (loading) return <main className="p-6">読み込み中…</main>;
  if (err)     return <main className="p-6 text-red-600">読み込みエラー：{err}</main>;

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">Subjects ({projectCode})</h1>
      {subjects.length === 0 ? (
        <p className="mt-4">まだ科目がありません。</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {subjects.map(s => (
            <li key={s.id} className="border rounded p-3">
              <div className="font-semibold">{s.name}</div>
              {/* 次の画面（セクション一覧）に進めたくなったらここをリンク化 */}
              {/* <a href={`/${projectCode}/sections?subjectId=${s.id}`} className="text-blue-600 underline">開く</a> */}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6"><a href={`/${projectCode}`} className="underline">◀ ダッシュボードへ戻る</a></p>
    </main>
  );
}

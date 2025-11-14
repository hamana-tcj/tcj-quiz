'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SubjectsPage() {
  const { projectCode } = useParams();
  const router = useRouter();
  const [subjects, setSubjects] = useState([]);
  const [msg, setMsg] = useState('読み込み中…');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/${projectCode}/login`);
        return;
      }

      const { data, error } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name');

      if (error) setMsg('読み込みエラー: ' + error.message);
      else {
        setSubjects(data || []);
        if (!data || data.length === 0) setMsg('まだ科目がありません。');
        else setMsg('');
      }
    })();
  }, [projectCode, router]);

  function goDashboard() {
    router.push(`/${projectCode}`);
  }

  function openSections(subjectId) {
    router.push(`/${projectCode}/sections?subject=${subjectId}`);
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Subjects ({projectCode})</h1>

      {msg && <p className="mt-4 text-sm">{msg}</p>}

      <div className="mt-4 space-y-3">
        {subjects.map((s) => (
          <button
            key={s.id}
            onClick={() => openSections(s.id)}
            className="w-full text-left border rounded px-4 py-2 hover:bg-gray-50"
          >
            {s.name}
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm">
        <button onClick={goDashboard} className="underline">
          ◀ ダッシュボードへ戻る
        </button>
      </p>
    </main>
  );
}

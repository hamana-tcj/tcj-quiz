'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SectionsPage() {
  const { projectCode } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const subjectId = searchParams.get('subject');
  const [sections, setSections] = useState([]);
  const [subjectName, setSubjectName] = useState('');
  const [msg, setMsg] = useState('読み込み中…');

  useEffect(() => {
    (async () => {
      // ログインチェック
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/${projectCode}/login`);
        return;
      }
      if (!subjectId) {
        setMsg('科目IDが指定されていません。');
        return;
      }

      // 科目名取得
      const { data: subj, error: subjErr } = await supabase
        .from('subjects')
        .select('name')
        .eq('id', subjectId)
        .maybeSingle();

      if (!subjErr && subj) setSubjectName(subj.name);

      // セクション一覧取得
      const { data, error } = await supabase
        .from('sections')
        .select('id, name')
        .eq('subject_id', subjectId)
        .order('name');

      if (error) setMsg('読み込みエラー: ' + error.message);
      else {
        setSections(data || []);
        if (!data || data.length === 0) setMsg('この科目にはまだセクションがありません。');
        else setMsg('');
      }
    })();
  }, [projectCode, router, subjectId]);

  function goSubjects() {
    router.push(`/${projectCode}/subjects`);
  }

  function openQuestions(sectionId) {
    router.push(`/${projectCode}/questions?section=${sectionId}`);
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">
        Sections ({projectCode}) {subjectName && `- ${subjectName}`}
      </h1>

      {msg && <p className="mt-4 text-sm">{msg}</p>}

      <div className="mt-4 space-y-3">
        {sections.map((sec) => (
          <button
            key={sec.id}
            onClick={() => openQuestions(sec.id)}
            className="w-full text-left border rounded px-4 py-2 hover:bg-gray-50"
          >
            {sec.name}
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm">
        <button onClick={goSubjects} className="underline">
          ◀ 科目一覧へ戻る
        </button>
      </p>
    </main>
  );
}

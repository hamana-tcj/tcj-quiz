'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function QuestionsPage() {
  const { projectCode } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sectionId = searchParams.get('section');
  const [sectionName, setSectionName] = useState('');
  const [questions, setQuestions] = useState([]);
  const [msg, setMsg] = useState('読み込み中…');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/${projectCode}/login`);
        return;
      }
      if (!sectionId) {
        setMsg('セクションIDが指定されていません。');
        return;
      }

      // セクション名
      const { data: sec, error: secErr } = await supabase
        .from('sections')
        .select('name')
        .eq('id', sectionId)
        .maybeSingle();
      if (!secErr && sec) setSectionName(sec.name);

      // 質問＋選択肢
      const { data, error } = await supabase
        .from('questions')
        .select(`
          id,
          body,
          explanation,
          choices (
            id,
            label,
            text,
            is_correct
          )
        `)
        .eq('section_id', sectionId)
        .order('id');

      if (error) setMsg('読み込みエラー: ' + error.message);
      else {
        setQuestions(data || []);
        if (!data || data.length === 0) setMsg('このセクションにはまだ問題がありません。');
        else setMsg('');
      }
    })();
  }, [projectCode, router, sectionId]);

  function goSections() {
    router.push(`/${projectCode}/sections?subjectBack=1`); // とりあえず戻り先用。あとで整理してOK
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">
        Questions ({projectCode}) {sectionName && `- ${sectionName}`}
      </h1>

      {msg && <p className="mt-4 text-sm">{msg}</p>}

      <div className="mt-4 space-y-6">
        {questions.map((q, idx) => (
          <div key={q.id} className="border rounded p-4">
            <p className="font-semibold">
              Q{idx + 1}. {q.body}
            </p>
            <ul className="mt-2 space-y-1 ml-4 list-disc">
              {q.choices?.map((c) => (
                <li key={c.id}>
                  <span className="font-mono mr-1">{c.label}.</span>
                  {c.text}
                  {/* 正解を見せたい場合だけ ↓ */}
                  {/* {c.is_correct && <span className="ml-2 text-xs text-green-600">← 正解</span>} */}
                </li>
              ))}
            </ul>
            {q.explanation && (
              <p className="mt-2 text-sm text-gray-600">解説: {q.explanation}</p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm">
        <button onClick={goSections} className="underline">
          ◀ セクション一覧へ戻る
        </button>
      </p>
    </main>
  );
}

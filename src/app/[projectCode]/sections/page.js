'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ErrorBox from '@/components/ErrorBox';

export default function SectionsPage() {
  const { projectCode } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const subjectId = searchParams.get('subject');
  const [sections, setSections] = useState([]);
  const [subjectName, setSubjectName] = useState('');
  const [msg, setMsg] = useState('読み込み中…');
  const [progressBySection, setProgressBySection] = useState({});

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
      const { data: sectionData, error: sectionErr } = await supabase
        .from('sections')
        .select('id, name')
        .eq('subject_id', subjectId)
        .order('name');

      if (sectionErr) {
        setMsg('読み込みエラー: ' + sectionErr.message);
        setSections([]);
        return;
      }

      const sectionsList = sectionData || [];
      setSections(sectionsList);
      if (sectionsList.length === 0) {
        setMsg('この科目にはまだセクションがありません。');
        setProgressBySection({});
        return;
      }

      setMsg('');

      const sectionIds = sectionsList.map((sec) => sec.id);

      const PAGE_SIZE = 1000;
      async function fetchAllRows(makeQuery) {
        let from = 0;
        const allRows = [];
        while (true) {
          const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          if (data && data.length > 0) {
            allRows.push(...data);
          }
          if (!data || data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
        return allRows;
      }

      let questions = [];
      try {
        questions = await fetchAllRows((from, to) =>
          supabase
            .from('questions')
            .select('id, section_id')
            .in('section_id', sectionIds)
            .range(from, to)
        );
      } catch (questionErr) {
        console.error(questionErr);
      }

      let logs = [];
      try {
        logs = await fetchAllRows((from, to) =>
          supabase
            .from('answer_logs')
            .select('section_id, question_id, is_correct')
            .eq('user_id', session.user.id)
            .in('section_id', sectionIds)
            .range(from, to)
        );
      } catch (logErr) {
        console.error(logErr);
      }

      const totalBySection = {};
      questions.forEach((q) => {
        totalBySection[q.section_id] =
          (totalBySection[q.section_id] || 0) + 1;
      });

      const answeredSet = new Map();
      const correctSet = new Map();

      logs.forEach((log) => {
        if (!answeredSet.has(log.section_id)) {
          answeredSet.set(log.section_id, new Set());
        }
        if (!correctSet.has(log.section_id)) {
          correctSet.set(log.section_id, new Set());
        }

        answeredSet.get(log.section_id).add(log.question_id);
        if (log.is_correct) {
          correctSet.get(log.section_id).add(log.question_id);
        }
      });

      const progress = {};
      sectionIds.forEach((id) => {
        progress[id] = {
          total: totalBySection[id] || 0,
          answered: answeredSet.get(id)?.size || 0,
          correct: correctSet.get(id)?.size || 0,
        };
      });

      setProgressBySection(progress);
    })();
  }, [projectCode, router, subjectId]);

  function goSubjects() {
    router.push(`/${projectCode}/subjects`);
  }

  function openQuestions(sectionId) {
    router.push(`/${projectCode}/questions?section=${sectionId}&subject=${subjectId}`);
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">
        Sections ({projectCode}) {subjectName && `- ${subjectName}`}
      </h1>

      {msg && <p className="mt-4 text-sm">{msg}</p>}

      <div className="mt-4 space-y-3">
        {sections.map((sec) => {
          const prog = progressBySection[sec.id] || {
            total: 0,
            answered: 0,
            correct: 0,
          };
          return (
          <button
            key={sec.id}
            onClick={() => openQuestions(sec.id)}
            className="w-full text-left border rounded px-4 py-2 hover:bg-gray-50"
          >
            <div className="flex justify-between items-center">
              <span>{sec.name}</span>
              <span className="text-sm text-gray-600">
                {prog.total}問中 {prog.correct}問 正解済
              </span>
            </div>
          </button>
        );
        })}
      </div>

      <p className="mt-6 text-sm">
        <button onClick={goSubjects} className="underline">
          ◀ 科目一覧へ戻る
        </button>
      </p>
    </main>
  );
}

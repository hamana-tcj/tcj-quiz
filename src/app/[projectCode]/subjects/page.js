'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ErrorBox from '@/components/ErrorBox';
import HeaderImage from '@/components/ui/HeaderImage';
import ProgressBar from '@/components/ui/ProgressBar';

export default function SubjectsPage() {
  const { projectCode } = useParams();
  const router = useRouter();
  const [subjects, setSubjects] = useState([]);
  const [msg, setMsg] = useState('読み込み中…');
  const [stats, setStats] = useState({}); // { subjectId: { total, answered, correct } }
  const [statsLoading, setStatsLoading] = useState(true);

  // 学習状況の取得処理
  async function loadStats(userId) {
    setStatsLoading(true);
    try {
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

      // 1) セクション一覧（科目紐付け用）
      const { data: sections, error: secErr } = await supabase
        .from('sections')
        .select('id, name, subject_id')
        .order('name', { ascending: true });

      if (secErr) throw secErr;

      // 2) 質問一覧（セクションごとの総問数を出したい）
      const questions = await fetchAllRows((from, to) =>
        supabase.from('questions').select('id, section_id').range(from, to)
      );

      // 3) 回答ログ（このユーザー分だけ）
      const logs = await fetchAllRows((from, to) =>
        supabase
          .from('answer_logs')
          .select('section_id, question_id, is_correct')
          .eq('user_id', userId)
          .range(from, to)
      );

      // --- 集計処理 ---

      // セクション／質問 → 科目IDのマップ
      const sectionToSubject = {};
      const questionToSubject = {};
      sections.forEach((sec) => {
        sectionToSubject[sec.id] = sec.subject_id;
      });

      // 科目ごとの総問数
      const totalBySubject = {};
      questions.forEach((q) => {
        const subjectId = sectionToSubject[q.section_id];
        if (!subjectId) return;
        questionToSubject[q.id] = subjectId;
        totalBySubject[subjectId] = (totalBySubject[subjectId] || 0) + 1;
      });

      // 科目ごとの回答数・正解数
      const answeredBySubject = {};
      const correctBySubject = {};
      const answeredQuestionSet = new Set();
      const correctQuestionSet = new Set();
      logs.forEach((log) => {
        const subjectId =
          questionToSubject[log.question_id] ??
          sectionToSubject[log.section_id];
        if (!subjectId || !log.question_id) return;

        if (!answeredQuestionSet.has(log.question_id)) {
          answeredQuestionSet.add(log.question_id);
          answeredBySubject[subjectId] =
            (answeredBySubject[subjectId] || 0) + 1;
        }

        if (log.is_correct && !correctQuestionSet.has(log.question_id)) {
          correctQuestionSet.add(log.question_id);
          correctBySubject[subjectId] =
            (correctBySubject[subjectId] || 0) + 1;
        }
      });

      // 統計情報をマップに変換
      const statsMap = {};
      Object.keys(totalBySubject).forEach((subjectId) => {
        statsMap[subjectId] = {
          total: totalBySubject[subjectId] || 0,
          answered: answeredBySubject[subjectId] || 0,
          correct: correctBySubject[subjectId] || 0,
        };
      });
      setStats(statsMap);
    } catch (err) {
      console.error(err);
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/${projectCode}/login`);
        return;
      }

      // 科目一覧取得
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

      // 学習状況取得
      await loadStats(session.user.id);
    })();
  }, [projectCode, router]);

  function openSections(subjectId) {
    router.push(`/${projectCode}/sections?subject=${subjectId}`);
  }

  // ログアウト処理
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace(`/${projectCode}/login`);
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <HeaderImage
        src="/logo.png"
        alt="TCJ ロゴ"
        contentMaxWidth="max-w-2xl"
      />
      <div className="p-6 max-w-2xl mx-auto">
        {/* 分野選択メッセージ */}
        <div className="mb-6">
          <div
            className="w-full rounded-lg text-white font-bold text-lg py-4 shadow-lg flex items-center justify-center"
            style={{ background: 'var(--bg-banner)' }}
          >
            分野を選んでください
          </div>
        </div>

      {msg && <p className="mt-4 text-sm" style={{ color: 'var(--text-primary)' }}>{msg}</p>}

      <div className="mt-4 space-y-3">
        {subjects.map((s) => {
          const stat = stats[s.id] || { total: 0, answered: 0, correct: 0 };
          return (
            <button
              key={s.id}
              onClick={() => openSections(s.id)}
              className="w-full text-left border rounded px-4 py-2 hover:bg-gray-50"
            >
              <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
              {statsLoading ? (
                <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>読み込み中…</p>
              ) : stat.total === 0 ? (
                <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                  この科目にはまだ問題が登録されていません。
                </p>
              ) : (
                <>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                    全{stat.total}問中 {stat.answered}問 解答（正解{' '}
                    {stat.correct}問）
                  </p>
                  <ProgressBar total={stat.total} answered={stat.answered} />
                </>
              )}
            </button>
          );
        })}
      </div>

        {/* ログアウト */}
        <div className="mt-6 text-left">
          <button
            onClick={handleSignOut}
            className="font-medium"
            style={{ color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ログアウト
          </button>
        </div>
      </div>
    </main>
  );
}

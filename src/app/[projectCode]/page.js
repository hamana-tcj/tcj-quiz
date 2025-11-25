'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ErrorBox from '@/components/ErrorBox';

export default function Dashboard() {
  const { projectCode } = useParams(); // 例: "tcj"
  const router = useRouter();

  const [user, setUser] = useState(null);

  // 学習状況用の state
  const [stats, setStats] = useState([]); // [{ subjectId, name, total, answered, correct }, ...]
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  // 学習状況の取得処理
  async function loadStats(userId) {
    setStatsLoading(true);
    setStatsError('');

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

      // 1) 科目一覧
      const { data: subjects, error: subjErr } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name', { ascending: true });

      if (subjErr) throw subjErr;

      // 2) セクション一覧（科目紐付け用）
      const { data: sections, error: secErr } = await supabase
        .from('sections')
        .select('id, name, subject_id')
        .order('name', { ascending: true });

      if (secErr) throw secErr;

      // 3) 質問一覧（セクションごとの総問数を出したい）
      const questions = await fetchAllRows((from, to) =>
        supabase.from('questions').select('id, section_id').range(from, to)
      );

      // 4) 回答ログ（このユーザー分だけ）
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

      // 科目マスタにまとめて結合
      const merged = subjects.map((subject) => ({
        subjectId: subject.id,
        name: subject.name,
        total: totalBySubject[subject.id] || 0,
        answered: answeredBySubject[subject.id] || 0,
        correct: correctBySubject[subject.id] || 0,
      }));

      setStats(merged);
    } catch (err) {
      console.error(err);
      setStatsError(err.message ?? '学習状況の取得に失敗しました。');
    } finally {
      setStatsLoading(false);
    }
  }

  // 認証チェック ＋ 学習状況取得
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace(`/${projectCode}/login`);
        return;
      }

      setUser(session.user);
      await loadStats(session.user.id);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        router.replace(`/${projectCode}/login`);
      } else {
        // ログイン状態が変わったら学習状況を取り直す
        loadStats(session.user.id);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [projectCode, router]);

  // サインアウト処理
  async function signOut() {
    await supabase.auth.signOut();
    router.replace(`/${projectCode}/login`);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">ダッシュボード ({projectCode})</h1>
      <p className="mt-3">
        ようこそ{user ? `、${user.email}` : ''}。
      </p>

      <div className="mt-6 flex gap-3">
        <button
          onClick={signOut}
          className="rounded bg-black text-white px-4 py-2"
        >
          サインアウト
        </button>
        <a
          href={`/${projectCode}/subjects`}
          className="underline self-center"
        >
          ▶ 科目一覧へ
        </a>
      </div>

      {/* 学習状況 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">学習状況</h2>

        {statsLoading && (
          <p className="mt-2 text-sm text-gray-500">読み込み中…</p>
        )}

        {statsError && <ErrorBox message={statsError} />}

        {!statsLoading && !statsError && (
          <>
            {stats.length === 0 ? (
              <p className="mt-2 text-sm">
                まだ回答履歴がありません。科目からセクションを選んで最初の問題に挑戦してみましょう。
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {stats.map((row) => (
                  <li
                    key={row.subjectId}
                    className="border rounded px-4 py-3"
                  >
                    <div className="font-medium">{row.name}</div>
                    {row.total === 0 ? (
                      <p className="text-sm text-gray-600 mt-1">
                        この科目にはまだ問題が登録されていません。
                      </p>
                    ) : (
                      <p className="text-sm text-gray-700 mt-1">
                        全{row.total}問中 {row.answered}問 回答（正解{' '}
                        {row.correct}問）
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function QuestionsPage() {
  const { projectCode } = useParams();           // 例: "tcj"
  const searchParams = useSearchParams();
  const router = useRouter();

  // section / sectionId どちらでも受け取れるように
  const sectionId =
    searchParams.get('section') ?? searchParams.get('sectionId');

  // 状態いろいろ
  const [questions, setQuestions] = useState([]);             // 問題＋選択肢
  const [selected, setSelected] = useState({});               // { 質問ID: 選んだ選択肢ID }
  const [result, setResult] = useState(null);                 // { total, correct }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 初期ロード：指定セクションの問題＋選択肢を取得
  useEffect(() => {
    if (!sectionId) {
      setError('セクションIDが指定されていません。');
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError('');
      setResult(null);
      setSelected({});

      // questions と choices をまとめて取得
      const { data, error } = await supabase
        .from('questions')
        .select('id, body, explanation, section_id, choices:choices (id, label, is_correct)')
        .eq('section_id', sectionId)
        .order('id', { ascending: true });

      if (error) {
        console.error(error);
        setError('問題の取得中にエラーが発生しました。');
      } else {
        setQuestions(data ?? []);
      }
      setLoading(false);
    })();
  }, [sectionId]);

  // 選択肢を選んだとき
  function handleSelect(questionId, choiceId) {
    setSelected((prev) => ({
      ...prev,
      [questionId]: choiceId,
    }));
  }

  // 「回答を送信」ボタン
  async function handleSubmit() {
    if (!questions.length) return;
  
    // ① 成績計算
    let total = questions.length;
    let correct = 0;
  
    questions.forEach((q) => {
      const chosenId = selected[q.id];
      const choices = q.choices ?? [];
      const correctChoice = choices.find((c) => c.is_correct);
  
      if (chosenId && correctChoice && chosenId === correctChoice.id) {
        correct += 1;
      }
    });
  
    setResult({ total, correct });
  
    // ② ログイン中のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
  
    if (userError) {
      console.error('getUser error', userError);
      return;
    }
    if (!user) {
      console.warn('not logged in, skip logging');
      return;
    }
  
    // ③ insert 用データをまとめる
    const rows = questions
      .map((q) => {
        const chosenId = selected[q.id];
        if (!chosenId) return null; // 未回答はスキップ
  
        const choices = q.choices ?? [];
        const correctChoice = choices.find((c) => c.is_correct);
        const isCorrect =
          correctChoice && chosenId === correctChoice.id;
  
        return {
          user_id: user.id,
          question_id: q.id,
          choice_id: chosenId,
          is_correct: isCorrect,
          section_id: q.section_id,
        };
      })
      .filter(Boolean); // null を除去
  
    if (!rows.length) return;
  
    // ④ Supabase に保存
    const { error: logError } = await supabase
      .from('answer_logs')
      .insert(rows);
  
    if (logError) {
      console.error('answer_logs insert error', logError);
    }
  }

  // 戻る
  function goBack() {
    router.push(`/${projectCode}/sections?subjectId=${questions[0]?.section_id ?? ''}`);
  }

  // ここから描画
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Questions ({projectCode})</h1>

      {!sectionId && (
        <ErrorBox message="セクションIDが指定されていません。">
      )}

      {error && <ErrorBox message="error" />
      {loading && <p>読み込み中…</p>}

      {!loading && !error && questions.length === 0 && (
        <p>このセクションにはまだ問題がありません。</p>
      )}

      {/* 問題一覧 */}
      <div className="space-y-6">
        {questions.map((q, index) => (
          <section
            key={q.id}
            className="border rounded-md p-4 bg-white shadow-sm"
          >
            <h2 className="font-semibold mb-2">
              Q{index + 1}. {q.body}
            </h2>

            <ul className="space-y-1 mb-3 list-none pl-0">
              {(q.choices ?? []).map((ch) => (
                <li key={ch.id}>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={ch.id}
                      checked={selected[q.id] === ch.id}
                      onChange={() => handleSelect(q.id, ch.id)}
                    />
                    <span>{ch.label}</span>
                  </label>
                </li>
              ))}
            </ul>

            <p className="text-sm text-gray-600">
              解説: {q.explanation || '（解説はまだ登録されていません）'}
            </p>
          </section>
        ))}
      </div>

      {/* 結果表示＋ボタン */}
      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={handleSubmit}
          className="inline-block px-4 py-2 rounded bg-black text-white self-start disabled:bg-gray-400"
          disabled={!questions.length}
        >
          回答を送信
        </button>

        {result && (
          <p className="mt-2 font-semibold">
            結果: {result.total}問中 {result.correct}問 正解
          </p>
        )}

        <button
          onClick={() => router.back()}
          className="text-sm text-blue-700 underline mt-4 self-start"
        >
          ◀ セクション一覧へ戻る
        </button>
      </div>
    </main>
  );
}

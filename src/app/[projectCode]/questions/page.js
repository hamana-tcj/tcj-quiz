'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ErrorBox } from '@/components/ErrorBox'; // ① 作ったコンポーネント

export default function QuestionsOneByOnePage() {
  const searchParams = useSearchParams();
  const { projectCode } = useParams();

  const sectionId = searchParams.get('section');
  const subjectId = searchParams.get('subject'); // あれば使う

  // ロード状態・エラー
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 問題一覧
  const [questions, setQuestions] = useState([]);

  // 出題モード用の state
  const [currentIndex, setCurrentIndex] = useState(0);        // 何問目か
  const [selectedChoiceId, setSelectedChoiceId] = useState(''); // その問題で選んだ選択肢
  const [phase, setPhase] = useState('question');             // "question" | "result" | "finish"
  const [isCorrectCurrent, setIsCorrectCurrent] = useState(null); // true / false / null
  const [totalCorrect, setTotalCorrect] = useState(0);        // 累計正解数

  // 最後の結果表示用
  const [result, setResult] = useState(null);
  // result の形：
  // {
  //   total: number;
  //   correct: number;
  //   details: {
  //     id: string;
  //     text: string;
  //     userChoiceLabel: string | null;
  //     isCorrect: boolean;
  //     explanation: string;
  //   }[];
  // }

  // ① 問題＋選択肢の取得
  useEffect(() => {
    if (!sectionId) {
      setErrorMsg('セクションIDが指定されていません。');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setErrorMsg('');

      const { data, error } = await supabase
        .from('questions')
        .select(`
          id,
          body,
          explanation,
          section_id,
          choices (
            id,
            label,
            is_correct
          )
        `)
        .eq('section_id', sectionId)
        .order('id', { ascending: true });

      if (error) {
        console.error(error);
        setErrorMsg('問題の読み込みに失敗しました。');
      } else {
        setQuestions(data || []);
        setCurrentIndex(0);
        setSelectedChoiceId('');
        setPhase('question');
        setIsCorrectCurrent(null);
        setTotalCorrect(0);
        setResult(null);
      }
      setLoading(false);
    };

    fetchData();
  }, [sectionId]);

  // ② 解答ログを Supabase に保存（1問ごと）
  const logAnswer = async (qId, choiceId, isCorrect) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // 未ログインなら何もしない

      await supabase.from('answer_logs').insert({
        user_id: session.user.id,
        question_id: qId,
        choice_id: choiceId,
        is_correct: isCorrect,
        section_id: sectionId,
      });
    } catch (e) {
      console.error('logAnswer error:', e);
    }
  };

  // ===== ここから早期 return 群 =====

  if (!sectionId) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Questions ({projectCode})</h1>
        <div className="mt-4">
          <ErrorBox message="セクションIDが指定されていません。" />
        </div>
        <p className="mt-6">
          <a href={`/${projectCode}/sections`} className="underline">
            ◀ セクション一覧へ戻る
          </a>
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Questions ({projectCode})</h1>
        <p className="mt-4">読み込み中…</p>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Questions ({projectCode})</h1>
        <div className="mt-4">
          <ErrorBox message={errorMsg} />
        </div>
        <p className="mt-6">
          <a href={`/${projectCode}/sections`} className="underline">
            ◀ セクション一覧へ戻る
          </a>
        </p>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Questions ({projectCode})</h1>
        <p className="mt-4">このセクションにはまだ問題がありません。</p>
        <p className="mt-6">
          <a href={`/${projectCode}/sections`} className="underline">
            ◀ セクション一覧へ戻る
          </a>
        </p>
      </main>
    );
  }

  // ===== ここから通常表示用の処理 =====

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  // 「回答を送信」ボタン押下
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedChoiceId) return;

    const choice = currentQuestion.choices.find(
      (c) => c.id === selectedChoiceId
    );
    const isCorrect = !!choice?.is_correct;

    setIsCorrectCurrent(isCorrect);
    setPhase('result');
    setTotalCorrect((prev) => prev + (isCorrect ? 1 : 0));

    // ログ保存
    await logAnswer(currentQuestion.id, selectedChoiceId, isCorrect);

    // ★ 最終問題だった場合は結果サマリも作っておく
    if (currentIndex + 1 === totalQuestions) {
      const lastDetail = {
        id: currentQuestion.id,
        text: currentQuestion.body,
        userChoiceLabel: choice ? choice.label : null,
        isCorrect,
        explanation: currentQuestion.explanation,
      };

      // それまでの回答は、簡易的に「全問正解 or 不正解」は分からないので
      // prototyping では「最後の1問だけ詳細」にしておく。
      // （もし全問分の詳細を残したければ、answers 配列を別 state に持つ形に拡張すればOK）
      setResult({
        total: totalQuestions,
        correct: totalCorrect + (isCorrect ? 1 : 0),
        details: [lastDetail],
      });
    }
  };

  // 「次の問題へ」ボタン押下
  const handleNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= totalQuestions) {
      setPhase('finish');
      return;
    }
    setCurrentIndex(nextIndex);
    setSelectedChoiceId('');
    setIsCorrectCurrent(null);
    setPhase('question');
  };

  // ===== 画面描画 =====

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">
        Questions ({projectCode}) - {currentIndex + 1}問目 / 全{totalQuestions}問
      </h1>

      {/* 質問表示フェーズ */}
      {phase === 'question' && (
        <section className="mt-6 border rounded p-4 bg-white">
          <h2 className="font-semibold">
            Q{currentIndex + 1}. {currentQuestion.body}
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-2">
            {currentQuestion.choices?.map((choice) => (
              <label key={choice.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`q-${currentQuestion.id}`}
                  value={choice.id}
                  checked={selectedChoiceId === choice.id}
                  onChange={() => setSelectedChoiceId(choice.id)}
                />
                <span>{choice.label}</span>
              </label>
            ))}

            <button
              type="submit"
              disabled={!selectedChoiceId}
              className="mt-4 rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            >
              回答を送信
            </button>
          </form>
        </section>
      )}

      {/* 判定＆解説フェーズ */}
      {phase === 'result' && (
        <section className="mt-6 border rounded p-4 bg-white">
          <h2 className="font-semibold">
            Q{currentIndex + 1}. {currentQuestion.body}
          </h2>

          <p className="mt-4 font-bold">
            {isCorrectCurrent ? '⭕ 正解！' : '❌ 不正解…'}
          </p>

          <p className="mt-2 text-sm text-gray-700">
            解説: {currentQuestion.explanation}
          </p>

          <button
            onClick={handleNext}
            className="mt-4 rounded bg-black text-white px-4 py-2"
          >
            {currentIndex + 1 === totalQuestions ? '結果を見る' : '次の問題へ'}
          </button>
        </section>
      )}

      {/* 全問終了フェーズ */}
      {phase === 'finish' && (
        <section className="mt-6 border rounded p-4 bg-white">
          <h2 className="font-semibold">結果</h2>
          <p className="mt-2">
            全{result ? result.total : totalQuestions}問中{' '}
            {result ? result.correct : totalCorrect}問 正解でした。
          </p>

          {/* prototyping なので、ひとまず最後の1問だけ詳細表示にしてある */}
          {result && result.details && (
            <div className="mt-4 space-y-4">
              {result.details.map((q) => (
                <div
                  key={q.id}
                  className="border rounded p-3 bg-white"
                >
                  <p className="font-semibold">{q.text}</p>
                  <p className="mt-1">
                    あなたの回答：{q.userChoiceLabel ?? '未回答'}
                  </p>
                  <p className="mt-1">
                    {q.isCorrect ? '⭕ 正解' : '❌ 不正解'}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    解説: {q.explanation}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-6">
            <a
              href={`/${projectCode}/sections?subject=${subjectId ?? ''}`}
              className="underline"
            >
              ◀ セクション一覧へ戻る
            </a>
          </p>
        </section>
      )}
    </main>
  );
}

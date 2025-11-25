'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ErrorBox from '@/components/ErrorBox'; // ① 作ったコンポーネント

function shuffleArray(items = []) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getChoicePrefix(index) {
  return String.fromCharCode(65 + index); // A, B, C...
}

export default function QuestionsOneByOnePage() {
  const searchParams = useSearchParams();
  const { projectCode } = useParams();
  const router = useRouter();

  const sectionId = searchParams.get('section');
  const subjectId = searchParams.get('subject'); // あれば使う

  // ロード状態・エラー
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 問題一覧
  const [questions, setQuestions] = useState([]);
  const [sectionsInSubject, setSectionsInSubject] = useState([]);
  const [sectionName, setSectionName] = useState('');

  // 出題モード用の state
  const [currentIndex, setCurrentIndex] = useState(0);        // 何問目か
  const [selectedChoiceId, setSelectedChoiceId] = useState(''); // その問題で選んだ選択肢
  const [phase, setPhase] = useState('question');             // "question" | "result" | "finish"
  const [isCorrectCurrent, setIsCorrectCurrent] = useState(null); // true / false / null
  const [totalCorrect, setTotalCorrect] = useState(0);        // 累計正解数

  // 全問の回答詳細を保存する配列
  const [answerDetails, setAnswerDetails] = useState([]);
  // answerDetails の各要素の形：
  // {
  //   id: string;
  //   text: string;
  //   userChoiceLabel: string | null;
  //   correctChoiceLabel: string | null;
  //   isCorrect: boolean;
  //   explanation: string;
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
      setSectionName('');
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
        const shuffledQuestions = (data || []).map((q) => ({
          ...q,
          choices: shuffleArray(q.choices || []),
        }));
        setQuestions(shuffledQuestions);
        setCurrentIndex(0);
        setSelectedChoiceId('');
        setPhase('question');
        setIsCorrectCurrent(null);
        setTotalCorrect(0);
        setAnswerDetails([]);
        const { data: sectionData, error: sectionError } = await supabase
          .from('sections')
          .select('name')
          .eq('id', sectionId)
          .maybeSingle();

        if (!sectionError && sectionData?.name) {
          setSectionName(sectionData.name);
        } else {
          setSectionName('');
        }
      }
      setLoading(false);
    };

    fetchData();
  }, [sectionId]);

  useEffect(() => {
    if (!subjectId) {
      setSectionsInSubject([]);
      return;
    }

    const fetchSections = async () => {
      const { data, error } = await supabase
        .from('sections')
        .select('id, name')
        .eq('subject_id', subjectId)
        .order('name', { ascending: true });

      if (!error && data) {
        setSectionsInSubject(data);
      }
    };

    fetchSections();
  }, [subjectId]);

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

  // ===== 通常表示用の基本値（Hooks は早期 return より前で宣言） =====
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex] ?? null;

  const nextSectionId = useMemo(() => {
    if (!subjectId || sectionsInSubject.length === 0) return null;

    const index = sectionsInSubject.findIndex(
      (sec) => String(sec.id) === String(sectionId)
    );
    if (index === -1) {
      return sectionsInSubject[0]?.id ?? null;
    }
    const nextIndex = (index + 1) % sectionsInSubject.length;
    return sectionsInSubject[nextIndex]?.id ?? null;
  }, [sectionId, subjectId, sectionsInSubject]);

  const correctChoiceIndex = currentQuestion?.choices?.findIndex(
    (c) => c.is_correct
  );
  const correctChoiceLabel =
    correctChoiceIndex >= 0
      ? `${getChoicePrefix(correctChoiceIndex)}. ${
          currentQuestion.choices[correctChoiceIndex].label
        }`
      : null;

  const headingTitle = sectionName || `Questions (${projectCode})`;

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
        <h1 className="text-2xl font-bold">{headingTitle}</h1>
        <p className="mt-4">読み込み中…</p>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">{headingTitle}</h1>
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
        <h1 className="text-2xl font-bold">{headingTitle}</h1>
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

  // 「回答を送信」ボタン押下
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedChoiceId) return;

    const choice = currentQuestion.choices.find(
      (c) => c.id === selectedChoiceId
    );
    const userChoiceIndex = currentQuestion.choices.findIndex(
      (c) => c.id === selectedChoiceId
    );
    const userChoiceLabel =
      userChoiceIndex >= 0
        ? `${getChoicePrefix(userChoiceIndex)}. ${choice?.label ?? ''}`
        : choice?.label ?? null;
    const isCorrect = !!choice?.is_correct;

    setIsCorrectCurrent(isCorrect);
    setPhase('result');
    const newTotalCorrect = totalCorrect + (isCorrect ? 1 : 0);
    setTotalCorrect(newTotalCorrect);

    // 現在の問題の回答詳細を保存
    const currentDetail = {
      id: currentQuestion.id,
      text: currentQuestion.body,
      userChoiceLabel,
      correctChoiceLabel,
      isCorrect,
      explanation: currentQuestion.explanation,
    };
    
    setAnswerDetails((prev) => [...prev, currentDetail]);

    // ログ保存
    await logAnswer(currentQuestion.id, selectedChoiceId, isCorrect);
  };

  const handleGoNextSection = () => {
    if (!nextSectionId) return;
    const url = `/${projectCode}/questions?section=${nextSectionId}${
      subjectId ? `&subject=${subjectId}` : ''
    }`;
    router.push(url);
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
        {headingTitle} - {currentIndex + 1}問目 / 全{totalQuestions}問
      </h1>

      {/* 質問表示フェーズ */}
      {phase === 'question' && (
        <section className="mt-6 border rounded p-4 bg-white">
          <h2 className="font-semibold">
            Q{currentIndex + 1}. {currentQuestion.body}
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-2">
            {currentQuestion.choices?.map((choice, index) => (
              <label key={choice.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`q-${currentQuestion.id}`}
                  value={choice.id}
                  checked={selectedChoiceId === choice.id}
                  onChange={() => setSelectedChoiceId(choice.id)}
                />
                <span>
                  {getChoicePrefix(index)}. {choice.label}
                </span>
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
          {!isCorrectCurrent && correctChoiceLabel && (
            <p className="mt-2 text-sm text-gray-700">
              正解: {correctChoiceLabel}
            </p>
          )}

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
            全{totalQuestions}問中 {totalCorrect}問 正解でした。
          </p>

          {/* 問題ごとの詳細一覧 */}
          {answerDetails.length > 0 && (
            <ul className="mt-4 space-y-3">
              {answerDetails.map((row, index) => (
                <li key={row.id} className="border rounded p-3">
                  <p className="font-semibold">
                    Q{index + 1}. {row.text}
                  </p>
                  <p className="mt-1">あなたの回答：{row.userChoiceLabel ?? '未回答'}</p>
                  <p
                    className={`mt-1 font-semibold ${
                      row.isCorrect ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {row.isCorrect ? '〇 正解' : '✕ 不正解'}
                  </p>
                  {!row.isCorrect && row.correctChoiceLabel && (
                    <p className="mt-1 text-sm text-gray-700">
                      正解: {row.correctChoiceLabel}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-gray-700">
                    解説: {row.explanation}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6">
            <a
              href={`/${projectCode}/sections?subject=${subjectId ?? ''}`}
              className="underline"
            >
              ◀ セクション一覧へ戻る
            </a>
          </p>
          {nextSectionId && (
            <p className="mt-2">
              <button onClick={handleGoNextSection} className="underline">
                ▶ 次のセクションへ
              </button>
            </p>
          )}
        </section>
      )}
    </main>
  );
}

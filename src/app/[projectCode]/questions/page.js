'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ErrorBox from '@/components/ErrorBox'; // ① 作ったコンポーネント
import ProgressBar from '@/components/ui/ProgressBar';

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
  const [subjectName, setSubjectName] = useState('');
  const [sectionIndex, setSectionIndex] = useState(0);

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

  // やめるボタンの確認ポップアップ
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
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
      setSubjectName('');
      return;
    }

    const fetchSections = async () => {
      // 科目名を取得
      const { data: subjectData, error: subjectError } = await supabase
        .from('subjects')
        .select('name')
        .eq('id', subjectId)
        .maybeSingle();

      if (!subjectError && subjectData) {
        setSubjectName(subjectData.name);
      }

      // セクション一覧を取得
      const { data, error } = await supabase
        .from('sections')
        .select('id, name')
        .eq('subject_id', subjectId)
        .order('name', { ascending: true });

      if (!error && data) {
        setSectionsInSubject(data);
        // 現在のセクションのインデックスを取得
        const currentIndex = data.findIndex((s) => s.id === sectionId);
        if (currentIndex !== -1) {
          setSectionIndex(currentIndex);
        }
      }
    };

    fetchSections();
  }, [subjectId, sectionId]);

  // ② 解答ログを Supabase に保存（1問ごと）
  const logAnswer = async (qId, choiceId, isCorrect) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('logAnswer: No session found');
        return; // 未ログインなら何もしない
      }

      // データ型を確認・変換
      // section_idは数値型の可能性があるため、数値に変換を試みる
      const sectionIdNum = sectionId ? (isNaN(Number(sectionId)) ? sectionId : Number(sectionId)) : null;
      
      const insertData = {
        user_id: session.user.id,
        question_id: qId,
        choice_id: choiceId,
        is_correct: Boolean(isCorrect),
        section_id: sectionIdNum || sectionId, // 数値に変換できた場合は数値、できなかった場合は元の値
      };

      const { data, error } = await supabase.from('answer_logs').insert(insertData);

      if (error) {
        console.error('logAnswer insert error:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        console.error('Insert data:', insertData);
        console.error('Data types:', {
          user_id: typeof insertData.user_id,
          question_id: typeof insertData.question_id,
          choice_id: typeof insertData.choice_id,
          is_correct: typeof insertData.is_correct,
          section_id: typeof insertData.section_id,
        });
      } else {
        console.log('logAnswer: Successfully saved', { qId, choiceId, isCorrect });
      }
    } catch (e) {
      console.error('logAnswer exception:', e);
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

  // 「回答を送信」ボタン押下（選択肢クリック時にも呼ばれる）
  const handleSubmit = async (e, choiceId = null) => {
    if (e) e.preventDefault();
    const targetChoiceId = choiceId || selectedChoiceId;
    if (!targetChoiceId) return;
    
    // 選択肢IDを設定
    if (choiceId) {
      setSelectedChoiceId(choiceId);
    }

    const choice = currentQuestion.choices.find(
      (c) => c.id === targetChoiceId
    );
    const userChoiceIndex = currentQuestion.choices.findIndex(
      (c) => c.id === targetChoiceId
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
    await logAnswer(currentQuestion.id, targetChoiceId || selectedChoiceId, isCorrect);
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

  // やめるボタンの処理
  function handleQuit() {
    setShowQuitConfirm(true);
  }

  function handleQuitConfirm() {
    router.push(`/${projectCode}/subjects`);
  }

  function handleQuitCancel() {
    setShowQuitConfirm(false);
  }

  // ===== 画面描画 =====

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto" style={{ background: '#e7eefb' }}>
      {/* やめるボタン（結果画面では非表示） */}
      {phase !== 'finish' && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleQuit}
            className="rounded-lg bg-white border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            やめる
          </button>
        </div>
      )}

      {/* 進捗バー */}
      <div className="mb-4">
        <ProgressBar 
          total={totalQuestions} 
          answered={currentIndex + 1} 
          color="#5170ff"
        />
      </div>

      <h1 className="font-bold" style={{ color: '#5170ff' }}>
        <div 
          className="whitespace-nowrap"
          style={{ 
            fontSize: 'clamp(1rem, 4vw, 1.5rem)'
          }}
        >
          {subjectName}セクション{String(sectionIndex + 1).padStart(3, '0')}
        </div>
        <div 
          className="whitespace-nowrap"
          style={{ 
            fontSize: 'clamp(0.875rem, 3vw, 1.25rem)'
          }}
        >
          ({currentIndex + 1}問目/全{totalQuestions}問)
        </div>
      </h1>

      {/* 質問表示フェーズ */}
      {phase === 'question' && (
        <section className="mt-6 rounded-lg p-6 bg-white">
          <h2 className="font-semibold mb-4 text-lg" style={{ color: '#7a797a' }}>
            {currentQuestion.body}
          </h2>
          
          {/* 正解/不正解メッセージと同じ高さのスペーサー（選択肢の位置を揃えるため） */}
          <div className="mb-6" style={{ height: '4.5rem', minHeight: '4.5rem' }}>
            <div className="font-bold text-4xl text-center" style={{ visibility: 'hidden' }}>
              ◎ 正解！
            </div>
          </div>
          
          <div className="space-y-3">
            {currentQuestion.choices?.map((choice, index) => (
              <button
                key={choice.id}
                onClick={() => {
                  handleSubmit(null, choice.id);
                }}
                className="w-full text-left rounded-lg border-2 p-4 flex items-center gap-4 hover:border-[#5170ff] transition-colors bg-white"
                style={{ 
                  borderColor: '#e5e7eb'
                }}
              >
                <input
                  type="radio"
                  name={`q-${currentQuestion.id}`}
                  value={choice.id}
                  checked={selectedChoiceId === choice.id}
                  onChange={() => {}}
                  className="w-6 h-6 flex-shrink-0 cursor-pointer"
                  style={{ accentColor: '#5170ff' }}
                />
                <span style={{ color: '#7a797a' }} className="flex-1 text-base">
                  {getChoicePrefix(index)}. {choice.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 判定＆解説フェーズ */}
      {phase === 'result' && (
        <section className="mt-6 rounded-lg p-6 bg-white">
          <h2 className="font-semibold mb-4 text-lg" style={{ color: '#7a797a' }}>
            {currentQuestion.body}
          </h2>

          {/* 正解/不正解メッセージ（固定高さで選択肢の位置を揃える） */}
          <div className="mb-6" style={{ height: '4.5rem', minHeight: '4.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p 
              className="font-bold text-4xl text-center"
              style={{ color: isCorrectCurrent ? '#7a797a' : '#ef4444' }}
            >
              {isCorrectCurrent ? '◎ 正解！' : '不正解…'}
            </p>
          </div>

          {/* 選択肢を表示（問題画面と同じ位置に配置） */}
          <div className="space-y-3">
            {currentQuestion.choices?.map((choice, index) => {
              const isSelected = selectedChoiceId === choice.id;
              const isCorrect = choice.is_correct;
              let buttonStyle = {
                borderColor: '#e5e7eb',
                backgroundColor: '#ffffff'
              };
              
              if (isSelected && isCorrect) {
                // 選択した選択肢が正解の場合
                buttonStyle = {
                  borderColor: '#00bf63',
                  backgroundColor: '#c6ffd5'
                };
              } else if (isSelected && !isCorrect) {
                // 選択した選択肢が不正解の場合
                buttonStyle = {
                  borderColor: '#cf0000',
                  backgroundColor: '#ffc3b3'
                };
              } else if (!isSelected && isCorrect) {
                // 選択していないが正解の場合
                buttonStyle = {
                  borderColor: '#00bf63',
                  backgroundColor: '#c6ffd5'
                };
              }

              return (
                <div
                  key={choice.id}
                  className="w-full text-left rounded-lg border-2 p-4 flex items-center gap-4 bg-white"
                  style={buttonStyle}
                >
                  {isSelected && !isCorrect && (
                    <span 
                      className="font-bold flex-shrink-0 flex items-center justify-center"
                      style={{ 
                        color: '#cf0000',
                        fontSize: '1rem',
                        lineHeight: '1rem',
                        width: '1rem',
                        height: '1rem'
                      }}
                    >
                      ✕
                    </span>
                  )}
                  {!isSelected && isCorrect && (
                    <span 
                      className="font-bold flex-shrink-0 flex items-center justify-center"
                      style={{ 
                        color: '#00bf63',
                        fontSize: '1.5rem',
                        lineHeight: '1.5rem',
                        width: '1.5rem',
                        height: '1.5rem'
                      }}
                    >
                      〇
                    </span>
                  )}
                  {isSelected && isCorrect && (
                    <span 
                      className="font-bold flex-shrink-0 flex items-center justify-center"
                      style={{ 
                        color: '#00bf63',
                        fontSize: '1.5rem',
                        lineHeight: '1.5rem',
                        width: '1.5rem',
                        height: '1.5rem'
                      }}
                    >
                      〇
                    </span>
                  )}
                  {!isSelected && !isCorrect && (
                    <span className="w-6 h-6 flex-shrink-0"></span>
                  )}
                  <span 
                    style={{ 
                      color: isSelected && !isCorrect 
                        ? '#7a797a' 
                        : (isSelected && isCorrect) || (!isSelected && isCorrect)
                        ? '#7a797a'
                        : '#7a797a'
                    }} 
                    className="flex-1 text-base"
                  >
                    {getChoicePrefix(index)}. {choice.label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-sm" style={{ color: '#7a797a' }}>
            解説: {currentQuestion.explanation}
          </p>

          <button
            onClick={handleNext}
            className="mt-6 rounded-lg text-white font-bold px-6 py-3 shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: '#5170ff' }}
          >
            {currentIndex + 1 === totalQuestions ? '結果を見る' : '次の問題へ'}
          </button>
        </section>
      )}

      {/* 全問終了フェーズ */}
      {phase === 'finish' && (
        <>
          {/* 結果バナー */}
          <div className="w-full mb-6">
            {/* スマホ：画面幅いっぱい、PC（md以上）：コンテンツ幅に収める */}
            <div className="w-full md:mx-auto md:max-w-2xl" style={{ 
              background: totalCorrect <= 5 
                ? '#99a1ae' 
                : totalCorrect >= 10 
                ? '#ffe89a' 
                : '#00bf63' 
            }}>
              <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6" style={{ paddingTop: '5%', paddingBottom: '5%' }}>
                {/* 左側の画像 */}
                <div className="flex-shrink-0">
                  <img
                    src={
                      totalCorrect <= 5 
                        ? '/ganbarou_kuma.png' 
                        : totalCorrect >= 10 
                        ? '/perfect_kuma.png' 
                        : '/atosukoshi_kuma.png'
                    }
                    alt="結果"
                    className="h-28 sm:h-36 w-auto object-contain"
                  />
                </div>

                {/* 右側のテキスト */}
                <div className="flex-1 min-w-0">
                  <div 
                    className="font-bold leading-tight"
                    style={{ 
                      color: totalCorrect >= 10 ? '#ff5907' : '#ffffff',
                      fontSize: 'clamp(0.875rem, 4vw, 1.5rem)'
                    }}
                  >
                    <div className="whitespace-nowrap">／</div>
                    <div className="whitespace-nowrap">
                      {totalCorrect <= 5 
                        ? `${totalCorrect}問正解！・・・がんばろう`
                        : totalCorrect >= 10 
                        ? '10問正解！パーフェクト！'
                        : `${totalCorrect}問正解！・・・あと少し`
                      }
                    </div>
                    <div className="whitespace-nowrap">＼</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="mt-6 border rounded p-4 bg-white">
            <div>
              <h2 className="font-semibold text-xl" style={{ color: '#7a797a' }}>結果</h2>
              <div 
                className="whitespace-nowrap text-base sm:text-lg md:text-xl"
                style={{ 
                  color: '#7a797a'
                }}
              >
                （全{totalQuestions}問中 {totalCorrect}問正解でした）
              </div>
            </div>

          {/* 問題ごとの詳細一覧 */}
          {answerDetails.length > 0 && (
            <ul className="mt-4 space-y-3">
              {answerDetails.map((row, index) => (
                <li key={row.id} className="border rounded p-3">
                  <p className="font-semibold" style={{ color: '#7a797a' }}>
                    Q{index + 1}. {row.text}
                  </p>
                  <p className="mt-1" style={{ color: '#7a797a' }}>あなたの回答：{row.userChoiceLabel ?? '未回答'}</p>
                  <p className="mt-1 font-semibold" style={{ color: row.isCorrect ? '#00bf63' : '#cf0000' }}>
                    {row.isCorrect ? '〇 正解' : '✕ 不正解'}
                  </p>
                  {!row.isCorrect && row.correctChoiceLabel && (
                    <p className="mt-1 text-sm" style={{ color: '#7a797a' }}>
                      正解: {row.correctChoiceLabel}
                    </p>
                  )}
                  <p className="mt-1 text-sm" style={{ color: '#7a797a' }}>
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
              style={{ color: '#7a797a' }}
            >
              ◀ セクション一覧へ戻る
            </a>
          </p>
          {nextSectionId && (
            <p className="mt-2">
              <button 
                onClick={handleGoNextSection} 
                className="underline"
                style={{ color: '#7a797a' }}
              >
                ▶ 次のセクションへ
              </button>
            </p>
          )}
        </section>
        </>
      )}

      {/* やめる確認ポップアップ */}
      {showQuitConfirm && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(231, 238, 251, 0.9)' }}
        >
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-lg border border-gray-200">
            <p className="text-base mb-6 text-center">
              科目選択画面に戻りますか？<br />
              これまで回答したデータは保存されます。
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleQuitConfirm}
                className="rounded-lg bg-[#5170ff] text-white px-6 py-2 font-medium hover:opacity-90 transition-opacity"
              >
                はい
              </button>
              <button
                onClick={handleQuitCancel}
                className="rounded-lg bg-gray-200 text-gray-800 px-6 py-2 font-medium hover:bg-gray-300 transition-colors"
              >
                いいえ
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

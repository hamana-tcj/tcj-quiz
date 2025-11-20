// src/app/[projectCode]/page.js
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useRequireAuth';
import ErrorBox from '@/components/ErrorBox';
import { getHomeData } from '@/lib/getHomeData';

export default function DashboardPage() {
  const { projectCode } = useParams();

  // ① 認証ガード
  const { user, loadingAuth } = useRequireAuth(`/${projectCode}/login`);

  // ② ダッシュボード用データ
  const [homeData, setHomeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!user) return; // useRequireAuth がリダイレクトしてくれる

    const fetch = async () => {
      setLoading(true);
      setErrorMsg('');

      try {
        const data = await getHomeData(user.id, projectCode);
        setHomeData(data);
      } catch (e) {
        console.error(e);
        setErrorMsg('学習状況の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [user, projectCode]);

  // ③ 認証チェック中
  if (loadingAuth) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold">ダッシュボード ({projectCode})</h1>
        <p className="mt-4">認証確認中です…</p>
      </main>
    );
  }

  // ④ ここに来る時点では user は存在する前提
  return (
    <main className="p-6 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ダッシュボード ({projectCode})</h1>
          <p className="mt-1 text-sm text-gray-600">
            ようこそ、{user?.email} さん。
          </p>
        </div>

        <a
          href={`/${projectCode}/subjects`}
          className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
        >
          ▶ 科目一覧へ
        </a>
      </header>

      {/* エラー表示 */}
      {errorMsg && <ErrorBox message={errorMsg} />}

      {/* 読み込み中 */}
      {loading && (
        <p className="mt-6 text-sm text-gray-700">学習状況を読み込み中です…</p>
      )}

      {/* データ表示 */}
      {!loading && homeData && (
        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">学習状況</h2>

          {homeData.sections?.length === 0 && (
            <p className="mt-2 text-sm text-gray-600">
              まだセクションが登録されていません。
            </p>
          )}

          {homeData.sections?.map((sec) => (
            <a
              key={sec.id}
              href={`/${projectCode}/sections?subject=${sec.subject_id}`}
              className="block rounded border bg-white px-4 py-3 hover:bg-gray-50"
            >
              <div className="font-semibold">{sec.name}</div>

              <div className="mt-1 text-sm text-gray-600">
                {typeof sec.totalQuestions === 'number' &&
                  sec.totalQuestions > 0 && (
                    <>
                      全{sec.totalQuestions}問中 {sec.answeredCount}問 回答
                      {typeof sec.correctCount === 'number' && (
                        <>（正解 {sec.correctCount}問）</>
                      )}
                    </>
                  )}

                {(!sec.totalQuestions || sec.totalQuestions === 0) && (
                  <>問題数が未設定です</>
                )}
              </div>
            </a>
          ))}
        </section>
      )}

      {/* データがない＆エラーもない */}
      {!loading && !homeData && !errorMsg && (
        <p className="mt-6 text-sm text-gray-600">
          表示できる学習状況データがありません。
        </p>
      )}
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Image from "next/image";

export default function Home() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Supabaseの認証フラグメント（パスワードリセットなど）を処理
    const handleAuthRedirect = () => {
      const hash = window.location.hash;
      
      if (hash && (hash.includes('access_token') || hash.includes('error'))) {
        setIsRedirecting(true);
        
        // フラグメントからtypeを取得して、パスワードリセットかどうかを判定
        const hashParams = new URLSearchParams(hash.substring(1));
        const type = hashParams.get('type');
        const error = hashParams.get('error');
        
        // projectCodeを取得（デフォルトは'tcj'）
        // 実際のプロジェクトコードは、環境変数や設定から取得するか、
        // セッション確立後にユーザー情報から取得する必要がある
        // ここでは、一般的なデフォルト値を使用
        const projectCode = 'tcj'; // 必要に応じて環境変数から取得
        
        // エラーの場合は、適切なページにリダイレクト
        if (error) {
          // エラーパラメータを保持してリダイレクト
          const errorParams = new URLSearchParams();
          errorParams.set('error', error);
          if (hashParams.get('error_code')) {
            errorParams.set('error_code', hashParams.get('error_code'));
          }
          if (hashParams.get('error_description')) {
            errorParams.set('error_description', hashParams.get('error_description'));
          }
          
          // フラグメントをクエリパラメータに変換してリダイレクト
          window.location.replace(`/${projectCode}/set-password?${errorParams.toString()}#${hash.substring(1)}`);
          return;
        }
        
        // パスワードリセットの場合
        if (type === 'recovery' || hash.includes('access_token')) {
          // パスワード設定ページにリダイレクト（フラグメントを保持）
          // window.location.replaceを使用して、即座にリダイレクト
          window.location.replace(`/${projectCode}/set-password${hash}`);
          return;
        }
      }
    };

    // 即座に実行（マウント時）
    handleAuthRedirect();
  }, []);

  // リダイレクト中の場合はローディング表示
  if (isRedirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p>リダイレクト中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the page.js file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}

// src/app/[projectCode]/login/page.js
export default async function LoginPage({ params }) {
    const { projectCode } = await params; // ← ここがポイント
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Login ({projectCode})</h1>
        <p className="mt-2">ここにログインフォームを置いていきます。</p>
      </main>
    );
  }
  
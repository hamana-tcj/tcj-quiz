'use client';

export default function ErrorBox({ title = 'エラー', message, children }) {
  if (!message) return null;

  return (
    <div className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 whitespace-pre-line">{message}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

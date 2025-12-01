'use client';

/**
 * 進捗バーコンポーネント
 * 
 * 学習の進捗を視覚的に表示するバーです。
 * 回答済みの割合に応じて色が付きます。
 * 
 * @param {number} total - 全問数
 * @param {number} answered - 回答済み問数
 * @param {string} color - 進捗バーの色（デフォルト: '#5170ff'）
 * @param {string} className - 追加のCSSクラス
 */
export default function ProgressBar({
  total,
  answered,
  color = '#5170ff',
  className = '',
}) {
  // 進捗率を計算（0-100%）
  const progress = total > 0 ? (answered / total) * 100 : 0;

  // 全問数が0の場合は表示しない
  if (total === 0) {
    return null;
  }

  return (
    <div className={`w-full mt-2 ${className}`}>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}


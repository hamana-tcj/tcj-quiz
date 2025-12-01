'use client';

/**
 * ヘッダー画像コンポーネント
 * 
 * レスポンシブ対応：
 * - スマホ：画面幅いっぱいに表示
 * - PC（md以上）：指定されたコンテンツ幅に収める
 * 
 * @param {string} src - 画像のパス（publicフォルダからの相対パス）
 * @param {string} alt - 画像の代替テキスト
 * @param {string} contentMaxWidth - PCでのコンテンツ最大幅（Tailwindクラス、デフォルト: 'max-w-2xl'）
 * @param {string} className - 追加のCSSクラス
 */
export default function HeaderImage({
  src,
  alt,
  contentMaxWidth = 'max-w-2xl',
  className = '',
}) {
  // レスポンシブクラス名を構築（Tailwindの動的クラス名を確実に認識させるため）
  const getContainerClasses = () => {
    const baseClasses = 'w-full md:mx-auto';
    const maxWidthMap = {
      'max-w-md': 'md:max-w-md',
      'max-w-lg': 'md:max-w-lg',
      'max-w-xl': 'md:max-w-xl',
      'max-w-2xl': 'md:max-w-2xl',
      'max-w-3xl': 'md:max-w-3xl',
      'max-w-4xl': 'md:max-w-4xl',
    };
    const maxWidthClass = maxWidthMap[contentMaxWidth] || 'md:max-w-2xl';
    return `${baseClasses} ${maxWidthClass}`;
  };

  return (
    <div className={`w-full mb-6 ${className}`}>
      {/* スマホ：画面幅いっぱい、PC（md以上）：コンテンツ幅に収める */}
      <div className={getContainerClasses()}>
        <img
          src={src}
          alt={alt}
          className="w-full h-auto object-contain"
        />
      </div>
    </div>
  );
}

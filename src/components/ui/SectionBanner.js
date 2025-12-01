'use client';

/**
 * セクション選択画面用バナーコンポーネント
 * 
 * 背景色#5170ffのバナーに、画像と科目名を含むテキストを表示します。
 * レスポンシブ対応で、スマホでは画面幅いっぱい、PCではコンテンツ幅に収めて表示します。
 * 
 * @param {string} subjectName - 科目名
 * @param {string} imageSrc - 画像のパス（publicフォルダからの相対パス、デフォルト: '/section.png'）
 * @param {string} contentMaxWidth - PCでのコンテンツ最大幅（Tailwindクラス、デフォルト: 'max-w-2xl'）
 * @param {string} className - 追加のCSSクラス
 */
export default function SectionBanner({
  subjectName,
  imageSrc = '/section.png',
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
      <div className={getContainerClasses()} style={{ background: '#5170ff' }}>
        <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6" style={{ paddingTop: '5%', paddingBottom: '5%' }}>
          {/* 左側の画像 */}
          <div className="flex-shrink-0">
            <img
              src={imageSrc}
              alt="セクション"
              className="h-28 sm:h-36 w-auto object-contain"
              style={{ background: '#5170ff' }}
            />
          </div>

          {/* 右側のテキスト */}
          <div className="flex-1 text-white min-w-0">
            <div className="text-sm sm:text-2xl font-bold leading-tight">
              <div className="break-words">{subjectName}の</div>
              <div>セクションに挑戦するよ！</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


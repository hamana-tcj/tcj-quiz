# UI共通コンポーネント

このディレクトリには、アプリケーション全体で再利用可能なUIコンポーネントを配置します。

## コンポーネント一覧

### HeaderImage

ヘッダー画像を表示するコンポーネント。レスポンシブ対応で、スマホでは画面幅いっぱい、PCではコンテンツ幅に収めて表示します。

#### 使用方法

```jsx
import HeaderImage from '@/components/ui/HeaderImage';

<HeaderImage
  src="/logo.png"
  alt="ロゴ"
  contentMaxWidth="max-w-2xl"
/>
```

#### Props

- `src` (string, 必須): 画像のパス（`public`フォルダからの相対パス）
- `alt` (string, 必須): 画像の代替テキスト
- `contentMaxWidth` (string, オプション): PCでのコンテンツ最大幅（Tailwindクラス）
  - デフォルト: `'max-w-2xl'`
  - 利用可能な値: `'max-w-md'`, `'max-w-lg'`, `'max-w-xl'`, `'max-w-2xl'`, `'max-w-3xl'`, `'max-w-4xl'`
- `className` (string, オプション): 追加のCSSクラス

#### レスポンシブ動作

- **スマホ（md未満）**: 画面幅いっぱいに表示
- **PC（md以上）**: 指定された`contentMaxWidth`に収めて中央揃え

### ProgressBar

学習の進捗を視覚的に表示するバーコンポーネント。回答済みの割合に応じて色が付きます。

#### 使用方法

```jsx
import ProgressBar from '@/components/ui/ProgressBar';

<ProgressBar
  total={300}
  answered={11}
  color="#5170ff"
/>
```

#### Props

- `total` (number, 必須): 全問数
- `answered` (number, 必須): 回答済み問数
- `color` (string, オプション): 進捗バーの色
  - デフォルト: `'#5170ff'`
- `className` (string, オプション): 追加のCSSクラス

#### 動作

- `total`が0の場合は何も表示しません
- 回答済みの割合（`answered / total * 100`）に応じてバーの幅が変わります
- アニメーション効果付きでスムーズに変化します

## 今後の拡張

新しい共通コンポーネントを追加する際は、このディレクトリに配置し、このREADMEに使用方法を追記してください。


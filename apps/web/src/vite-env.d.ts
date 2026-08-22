/// <reference types="vite/client" />

// Places API (New) 用。キーはビルド環境の環境変数から読む(コードに直書きしない)。
// 未設定でも動く(places.ts がフォールバックする)ので、型も optional にする。
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

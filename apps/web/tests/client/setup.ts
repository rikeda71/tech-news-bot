import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

// happy-dom はブラウザ環境をシミュレートするが自動クリーンアップはしないため明示的に実行する
afterEach(() => {
  cleanup();
});

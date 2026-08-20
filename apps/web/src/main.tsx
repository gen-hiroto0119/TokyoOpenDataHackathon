import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root がありません");
}

createRoot(root).render(
  <StrictMode>
    <p>Storybook で部品を見る。</p>
  </StrictMode>,
);

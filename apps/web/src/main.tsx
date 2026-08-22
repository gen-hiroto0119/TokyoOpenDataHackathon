import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { HomePage } from "./pages/HomePage.js";
import { RoomPage } from "./pages/RoomPage.js";
import { sweepExpired } from "./session.js";
import { CacheProvider } from "./swr.js";

// 起動時に期限切れのルームキーを掃除する。
sweepExpired();

// PWA 用 Service Worker の登録。dev では HMR を壊すため登録しない。
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("root がありません");
}

createRoot(root).render(
  <StrictMode>
    <CacheProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/r/:roomId" element={<RoomPage />} />
        </Routes>
      </BrowserRouter>
    </CacheProvider>
  </StrictMode>,
);

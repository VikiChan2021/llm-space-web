import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
} from "@llm-space/ui/lib/local-storage";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { App } from "@/app";
// This is the web app's single CSS entry. It imports the shared UI globals first,
// then adds the landing-only theme tokens and helpers in the same Tailwind graph.
import "@/landing/index.css";

// 在 React 挂载前应用已保存主题，避免浅色/深色首屏闪烁。
const storedTheme = readLocalStorage(LOCAL_STORAGE_KEYS.theme);
const initialDark =
  storedTheme === "dark" ||
  (storedTheme === "system" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches) ||
  (storedTheme !== "light" && storedTheme !== "system");
document.documentElement.classList.toggle("dark", initialDark);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);

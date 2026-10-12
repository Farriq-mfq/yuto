import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "@fontsource/ibm-plex-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./App";
import "./index.css";
import { applyThemePreference, THEME_STORAGE_KEY } from "./lib/theme";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Placeholder from "./pages/Placeholder";
import { strings } from "./strings";

const queryClient = new QueryClient();

// Tema: "system" (default, ikut OS) | "light" | "dark", tersimpan di
// localStorage (THEME_STORAGE_KEY). Manual override mengabaikan OS sampai
// user kembali ke system. Inline script di index.html sudah set class awal
// agar tanpa flash; di sini sinkron ulang + dengar perubahan OS & antar-tab.
applyThemePreference();
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => applyThemePreference());
window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY) applyThemePreference();
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route
              path="/wallet"
              element={<Placeholder title={strings.navWallet} />}
            />
            <Route
              path="/record"
              element={<Placeholder title={strings.navRecord} />}
            />
            <Route
              path="/activity"
              element={<Placeholder title={strings.navActivity} />}
            />
            <Route
              path="/reports"
              element={<Placeholder title={strings.navReports} />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

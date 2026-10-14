import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/ibm-plex-mono";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./App";
import { NativeDataSourceGate } from "./components/NativeDataSourceGate";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { Toaster } from "./components/ui/sonner";
import "./index.css";
import { DataSourceProvider } from "./lib/datasourceContext";
import { applyThemePreference, THEME_STORAGE_KEY } from "./lib/theme";
import { strings } from "./strings";
import Home from "./pages/Home";
import Activity from "./pages/Activity";
import Login from "./pages/Login";
import AccountEdit from "./pages/AccountEdit";
import AccountNew from "./pages/AccountNew";
import Record from "./pages/Record";
import Reports from "./pages/Reports";
import TransactionDetail from "./pages/TransactionDetail";
import TransactionEdit from "./pages/TransactionEdit";
import Transfer from "./pages/Transfer";
import Wallet from "./pages/Wallet";

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

// why: aplikasi native (Capacitor) memakai SQLite lokal single-owner —
// tanpa login, tanpa sesi HTTP. Web tetap memakai HttpDataSource + /login.
const isNative = Capacitor.isNativePlatform();

// why: chunk AppLock (plugin biometrik + @capacitor/app) hanya diunduh dan
// di-render di perangkat; web tak pernah menyentuhnya. Fallback Suspense
// fail-closed: layar "memeriksa kunci", bukan konten aplikasi.
// Urutan di bawah: AppLock di LUAR NativeDataSourceGate — database
// terenkripsi baru dibuka SETELAH user lolos autentikasi perangkat.
const NativeAppLock = lazy(() =>
  import("./components/AppLock").then((module) => ({
    default: module.AppLock,
  })),
);

function NativeLockSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground" role="status">
        {strings.lockChecking}
      </p>
    </div>
  );
}

function RoutedApp() {
  return (
    <BrowserRouter>
      <PwaUpdatePrompt />
      <Toaster position="top-center" />
      <Routes>
        <Route
          path="/login"
          element={isNative ? <Navigate to="/" replace /> : <Login />}
        />
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/wallet/new" element={<AccountNew />} />
          <Route path="/wallet/:id" element={<AccountEdit />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/record" element={<Record />} />
          <Route path="/transactions/:id" element={<TransactionDetail />} />
          <Route
            path="/transactions/:id/edit"
            element={<TransactionEdit />}
          />
          <Route path="/activity" element={<Activity />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isNative ? (
        <Suspense fallback={<NativeLockSplash />}>
          <NativeAppLock>
            <NativeDataSourceGate>
              <RoutedApp />
            </NativeDataSourceGate>
          </NativeAppLock>
        </Suspense>
      ) : (
        <DataSourceProvider>
          <RoutedApp />
        </DataSourceProvider>
      )}
    </QueryClientProvider>
  </StrictMode>,
);

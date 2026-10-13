import { Outlet } from "react-router-dom";
import { OfflineBanner } from "./components/OfflineBanner";
import { TabBar } from "./components/TabBar";

export function Shell() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <OfflineBanner />
      <Outlet />
      <TabBar />
    </div>
  );
}

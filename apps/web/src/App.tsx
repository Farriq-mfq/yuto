import { Outlet } from "react-router-dom";
import { TabBar } from "./components/TabBar";

export function Shell() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <Outlet />
      <TabBar />
    </div>
  );
}

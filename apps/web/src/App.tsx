import { Outlet } from "react-router-dom";
import { SkipLink } from "./components/SkipLink";
import { TabBar } from "./components/TabBar";

export function Shell() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <SkipLink />
      <Outlet />
      <TabBar />
    </div>
  );
}

import {
  IconCalendar,
  IconChartBar,
  IconHome,
  IconPlus,
  IconWallet,
} from "@tabler/icons-react";
import { NavLink } from "react-router-dom";
import { strings } from "../strings";

const tabs = [
  { to: "/", label: strings.navHome, end: true, icon: IconHome },
  { to: "/wallet", label: strings.navWallet, end: false, icon: IconWallet },
  { to: "/record", label: strings.navRecord, end: false, center: true, icon: IconPlus },
  { to: "/activity", label: strings.navActivity, end: false, icon: IconCalendar },
  { to: "/reports", label: strings.navReports, end: false, icon: IconChartBar },
];

export function TabBar() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed bottom-0 left-0 right-0 border-t border-border bg-background"
    >
      <div className="mx-auto flex max-w-[480px] items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            aria-label={tab.label}
            className={({ isActive }) =>
              `flex min-h-[56px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                tab.center
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <tab.icon size={20} strokeWidth={2} />
            </span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

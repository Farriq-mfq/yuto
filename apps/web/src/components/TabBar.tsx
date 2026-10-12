import {
  CalendarIcon,
  ChartBarIcon,
  HomeIcon,
  PlusIcon,
  WalletIcon,
} from "@/icons";
import { NavLink } from "react-router-dom";
import { strings } from "../strings";

const tabs = [
  { to: "/", label: strings.navHome, end: true, icon: HomeIcon },
  { to: "/wallet", label: strings.navWallet, end: false, icon: WalletIcon },
  { to: "/record", label: strings.navRecord, end: false, center: true, icon: PlusIcon },
  { to: "/activity", label: strings.navActivity, end: false, icon: CalendarIcon },
  { to: "/reports", label: strings.navReports, end: false, icon: ChartBarIcon },
];

export function TabBar() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-background"
    >
      <div className="flex w-full items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            aria-label={tab.label}
            className={({ isActive }) =>
              `flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                tab.center
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <tab.icon size={20} strokeWidth={2} />
            </span>
            <span className="max-w-full whitespace-nowrap text-[11px] leading-tight min-[400px]:text-xs">
              {tab.label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

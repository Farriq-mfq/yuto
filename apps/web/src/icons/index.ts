/**
 * Satu-satunya importir `@tabler/icons-react` di apps/web.
 *
 * Komponen mengimpor nama generik dari `@/icons` (bukan dari
 * `@tabler/icons-react` langsung) agar swap library ikon cukup di sini.
 */
export {
  IconArrowsLeftRight as TransferIcon,
  IconCalendar as CalendarIcon,
  IconChartBar as ChartBarIcon,
  IconCheck as CheckIcon,
  IconChevronDown as ChevronDownIcon,
  IconChevronLeft as ChevronLeftIcon,
  IconChevronRight as ChevronRightIcon,
  IconChevronUp as ChevronUpIcon,
  IconDeviceDesktop as DeviceDesktopIcon,
  IconEye as EyeIcon,
  IconEyeOff as EyeOffIcon,
  IconHome as HomeIcon,
  // @tabler/icons-react 3.49 belum punya IconLandmark / IconBanknote polos;
  // padanan terdekat: gedung bank klasik (~landmark) & uang kertas (~banknote).
  IconBuildingBank as LandmarkIcon,
  IconCashBanknote as BanknoteIcon,
  IconLock as LockIcon,
  IconMapPin as MapPinIcon,
  IconMinus as MinusIcon,
  IconMoon as MoonIcon,
  IconPlus as PlusIcon,
  IconReceipt as ReceiptIcon,
  IconSelector as SelectorIcon,
  IconSun as SunIcon,
  IconTrash as TrashIcon,
  IconTrendingDown as TrendingDownIcon,
  IconTrendingUp as TrendingUpIcon,
  IconWallet as WalletIcon,
} from "@tabler/icons-react";

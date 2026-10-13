import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { id as localeId } from "react-day-picker/locale";
import { CalendarIcon, MapPinIcon, PlusIcon, TrashIcon } from "@/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  combineLocalDateTime,
  formatLocalDateId,
  formatRupiah,
  localDateFromDatePart,
  splitLocalDateTime,
} from "../lib/format";
import { previewBalance } from "../lib/preview";
import { fetchAppConfig, type TxKind } from "../lib/queries";
import { formatCoords } from "../lib/location";
import { strings } from "../strings";

// Peta Leaflet di-split ke chunk sendiri: hanya diunduh bila seksi lokasi
// tampil (mapEnabled), sehingga MAP_ENABLED=false = nol request tile.
const LocationPicker = lazy(() =>
  import("./LocationPicker").then((module) => ({
    default: module.LocationPicker,
  })),
);

export interface AccountOption {
  id: string;
  name: string;
  institution: string;
  balance: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  kind: TxKind;
}

export interface ItemValue {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface TxFormInitial {
  kind: TxKind;
  accountId: string;
  categoryId: string;
  title: string;
  amount: number;
  /** Waktu lokal `YYYY-MM-DDTHH:mm` (zona Asia/Jakarta). */
  occurredAtLocal: string;
  note: string;
  items: ItemValue[];
  /** Pin lokasi; null bila belum ada. */
  latitude: number | null;
  longitude: number | null;
  locationName: string;
}

export interface TxFormValues {
  kind: TxKind;
  accountId: string;
  categoryId: string;
  title: string;
  amount: number;
  /** Instant UTC (ISO) siap kirim ke API. */
  occurredAtIso: string;
  note: string;
  items: ItemValue[];
  /** null bila seksi lokasi mati / pin belum ditaruh (mapping di page). */
  latitude: number | null;
  longitude: number | null;
  locationName: string;
}

interface TransactionFormProps {
  initial: TxFormInitial;
  accounts: AccountOption[];
  categories: CategoryOption[];
  /** Saldo "sebelum" untuk akun tsb (record: saldo kini; edit: sebelum-tx). */
  previewBase: (accountId: string) => number | undefined;
  pending: boolean;
  serverError: string | null;
  onSubmit: (values: TxFormValues) => void;
  onCancel: () => void;
}

interface ItemDraft {
  key: number;
  name: string;
  quantity: string;
  unitPrice: string;
}

const grouped = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function formatGrouped(amount: number): string {
  return grouped.format(Math.round(amount));
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 15);
}

function parsePositiveInt(text: string): number {
  const digits = text.replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

/**
 * Nilai waktu lokal valid bila tidak kosong dan bisa di-parse
 * menjadi instant yang valid. `new Date("")` menghasilkan Invalid Date
 * yang melempar RangeError saat `.toISOString()` dipanggil.
 */
export function isValidLocalDateTime(value: string): boolean {
  if (value === "") return false;
  return !Number.isNaN(new Date(value).getTime());
}

const CHIPS = [
  { label: strings.chip10k, value: 10_000 },
  { label: strings.chip20k, value: 20_000 },
  { label: strings.chip50k, value: 50_000 },
  { label: strings.chip100k, value: 100_000 },
];

/**
 * Form catat/ubah transaksi (satu komponen untuk Record + Edit agar
 * perilaku validasi dan pratinjau selalu sama).
 */
export function TransactionForm({
  initial,
  accounts,
  categories,
  previewBase,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const [kind, setKind] = useState<TxKind>(initial.kind);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [title, setTitle] = useState(initial.title);
  const [amountInput, setAmountInput] = useState(
    initial.amount > 0 ? formatGrouped(initial.amount) : "",
  );
  const [occurredAtLocal, setOccurredAtLocal] = useState(
    initial.occurredAtLocal,
  );
  const [dateOpen, setDateOpen] = useState(false);
  const [note, setNote] = useState(initial.note);
  const [locationOn, setLocationOn] = useState(
    initial.latitude !== null ||
      initial.longitude !== null ||
      initial.locationName !== "",
  );
  const [latitude, setLatitude] = useState<number | null>(initial.latitude);
  const [longitude, setLongitude] = useState<number | null>(initial.longitude);
  const [locationName, setLocationName] = useState(initial.locationName);
  const [items, setItems] = useState<ItemDraft[]>(() =>
    initial.items.map((item, index) => ({
      key: index,
      name: item.name,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const keyRef = useRef(initial.items.length);

  const amount = useMemo(
    () => parsePositiveInt(amountInput),
    [amountInput],
  );

  // Switch peta publik (cache lama: boolean UI, bukan rahasia).
  // Gagal/error dianggap mati: seksi lokasi tidak tampil sama sekali.
  const config = useQuery({
    queryKey: ["config"],
    queryFn: fetchAppConfig,
    staleTime: Infinity,
    retry: false,
  });
  const mapEnabled = config.data?.mapEnabled === true;

  // Nilai lokasi efektif: toggle mati = tidak ada lokasi yang dikirim.
  // (Mode Edit: mematikan toggle membiarkan lokasi server apa adanya —
  //  API tak mendukung penghapusan pin, jadi jangan kirim null.)
  const effectiveLatitude = locationOn ? latitude : null;
  const effectiveLongitude = locationOn ? longitude : null;
  const effectiveLocationName = locationOn ? locationName.trim() : "";
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.kind === kind),
    [categories, kind],
  );
  // Label trigger di-render eksplisit dari data (bukan SelectValue):
  // Base UI me-resolve label dari item yang ter-mount; saat popup
  // tertutup (unmount) ia fallback ke raw value sehingga UUID tampil.
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accounts, accountId],
  );
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId],
  );

  // Kontrol tanggal & jam terpisah berbagi satu string `occurredAtLocal`
  // agar format, validasi, dan pratinjau tak berubah perilaku.
  const { date: datePart, time: timePart } =
    splitLocalDateTime(occurredAtLocal);
  const selectedDate = localDateFromDatePart(datePart);
  const dateButtonLabel = formatLocalDateId(datePart) ?? strings.datePickDate;

  function handleKindChange(next: TxKind) {
    setKind(next);
    // Jangan biarkan kind != kategori lolos: kategori lama beda jenis
    // harus dipilih ulang (validasi server tetap penentu akhir).
    if (!categories.some((c) => c.id === categoryId && c.kind === next)) {
      setCategoryId("");
    }
  }

  const filledItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.name.trim() !== "" ||
          item.quantity.trim() !== "" ||
          item.unitPrice.trim() !== "",
      ),
    [items],
  );
  const itemsComplete = filledItems.every(
    (item) =>
      item.name.trim() !== "" &&
      parsePositiveInt(item.quantity) >= 1 &&
      parsePositiveInt(item.unitPrice) >= 1,
  );
  const itemsSum = filledItems.reduce(
    (sum, item) =>
      sum + parsePositiveInt(item.quantity) * parsePositiveInt(item.unitPrice),
    0,
  );
  const itemsError =
    filledItems.length === 0
      ? null
      : !itemsComplete
        ? strings.itemsIncomplete
        : itemsSum !== amount
          ? strings.itemsMismatch
          : null;

  const dirty = useMemo(() => {
    const initialItems = initial.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
    const currentItems = filledItems.map((item) => ({
      name: item.name.trim(),
      quantity: parsePositiveInt(item.quantity),
      unitPrice: parsePositiveInt(item.unitPrice),
    }));
    return (
      kind !== initial.kind ||
      accountId !== initial.accountId ||
      categoryId !== initial.categoryId ||
      title.trim() !== initial.title ||
      amount !== initial.amount ||
      occurredAtLocal !== initial.occurredAtLocal ||
      note.trim() !== initial.note ||
      effectiveLatitude !== initial.latitude ||
      effectiveLongitude !== initial.longitude ||
      effectiveLocationName !== initial.locationName.trim() ||
      JSON.stringify(currentItems) !== JSON.stringify(initialItems)
    );
  }, [
    kind,
    accountId,
    categoryId,
    title,
    amount,
    occurredAtLocal,
    note,
    effectiveLatitude,
    effectiveLongitude,
    effectiveLocationName,
    filledItems,
    initial,
  ]);

  const dateError =
    occurredAtLocal === "" || !isValidLocalDateTime(occurredAtLocal)
      ? strings.dateInvalid
      : null;

  const canSave =
    accountId !== "" &&
    categoryId !== "" &&
    amount > 0 &&
    title.trim() !== "" &&
    dateError === null &&
    itemsError === null &&
    !pending;

  const preview = useMemo(() => {
    if (accountId === "") return null;
    const base = previewBase(accountId);
    if (base === undefined) return null;
    return previewBalance({ currentBalance: base, kind, amount });
  }, [accountId, kind, amount, previewBase]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedDate = new Date(occurredAtLocal);
    if (!canSave || Number.isNaN(parsedDate.getTime())) return;
    onSubmit({
      kind,
      accountId,
      categoryId,
      title: title.trim(),
      amount,
      occurredAtIso: parsedDate.toISOString(),
      note: note.trim(),
      latitude: effectiveLatitude,
      longitude: effectiveLongitude,
      locationName: locationOn ? locationName.trim() : "",
      items: itemsError
        ? []
        : filledItems.map((item) => ({
            name: item.name.trim(),
            quantity: parsePositiveInt(item.quantity),
            unitPrice: parsePositiveInt(item.unitPrice),
          })),
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Tabs
            value={kind}
            onValueChange={(next) => handleKindChange(next as TxKind)}
          >
            <TabsList aria-label={strings.kindLabel} className="h-auto w-full">
              <TabsTrigger
                value="expense"
                className="min-h-[44px] flex-1"
              >
                {strings.kindExpense}
              </TabsTrigger>
              <TabsTrigger value="income" className="min-h-[44px] flex-1">
                {strings.kindIncome}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tx-account">{strings.accountLabel}</Label>
          <Select
            value={accountId === "" ? null : accountId}
            onValueChange={(next) => setAccountId(next ?? "")}
          >
            <SelectTrigger id="tx-account" className="min-h-[44px] w-full">
              {selectedAccount ? (
                <span className="flex min-w-0 flex-1 truncate text-left">
                  {selectedAccount.name} ·{" "}
                  {formatRupiah(selectedAccount.balance)}
                </span>
              ) : (
                <SelectValue placeholder={strings.selectAccount} />
              )}
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} · {formatRupiah(account.balance)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{strings.noAccounts}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tx-category">{strings.categoryLabel}</Label>
          <Select
            value={categoryId === "" ? null : categoryId}
            onValueChange={(next) => setCategoryId(next ?? "")}
          >
            <SelectTrigger id="tx-category" className="min-h-[44px] w-full">
              {selectedCategory ? (
                <span className="flex min-w-0 flex-1 truncate text-left">
                  {selectedCategory.name}
                </span>
              ) : (
                <SelectValue placeholder={strings.selectCategory} />
              )}
            </SelectTrigger>
            <SelectContent>
              {visibleCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {visibleCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {strings.noCategories}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tx-amount">{strings.amountLabel}</Label>
          <Input
            id="tx-amount"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={amountInput}
            onChange={(event) => {
              const digits = digitsOnly(event.target.value);
              setAmountInput(
                digits === "" ? "" : formatGrouped(Number(digits)),
              );
            }}
            className="min-h-[44px] tabular-nums"
          />
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <Button
                key={chip.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAmountInput(formatGrouped(amount + chip.value))
                }
                className="min-h-[44px] tabular-nums"
              >
                {chip.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tx-title">{strings.titleLabel}</Label>
          <Input
            id="tx-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={strings.titlePlaceholder}
            maxLength={200}
            className="min-h-[44px]"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="tx-date-button">
                {strings.dateFieldLabel}
              </Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      id="tx-date-button"
                      type="button"
                      variant="outline"
                      className="min-h-[44px] w-full justify-start font-normal"
                    >
                      <CalendarIcon size={20} aria-hidden="true" />
                      <span className="truncate">{dateButtonLabel}</span>
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-auto p-2">
                  <Calendar
                    mode="single"
                    locale={localeId}
                    key={datePart}
                    defaultMonth={selectedDate ?? new Date()}
                    selected={selectedDate}
                    onSelect={(next) => {
                      if (!next) return;
                      setOccurredAtLocal(
                        combineLocalDateTime(next, timePart),
                      );
                      setDateOpen(false);
                    }}
                    // why: label navigasi bawaan Inggris.
                    labels={{
                      labelPrevious: () => strings.calendarPrevMonth,
                      labelNext: () => strings.calendarNextMonth,
                    }}
                    className="[--cell-size:--spacing(11)]"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex w-32 shrink-0 flex-col gap-2">
              <Label htmlFor="tx-time">{strings.timeLabel}</Label>
              <Input
                id="tx-time"
                type="time"
                value={timePart}
                onChange={(event) =>
                  setOccurredAtLocal(`${datePart}T${event.target.value}`)
                }
                className="min-h-[44px] tabular-nums"
              />
            </div>
          </div>
          {dateError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {dateError}
            </p>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{strings.itemsLabel}</legend>
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-end gap-2 rounded-xl border border-border p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor={`item-name-${item.key}`}>
                  {strings.itemNameLabel}
                </Label>
                <Input
                  id={`item-name-${item.key}`}
                  value={item.name}
                  onChange={(event) =>
                    setItems((prev) =>
                      prev.map((row) =>
                        row.key === item.key
                          ? { ...row, name: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder={strings.itemNamePlaceholder}
                  className="min-h-[44px]"
                />
              </div>
              <div className="flex w-16 flex-col gap-1">
                <Label htmlFor={`item-qty-${item.key}`}>
                  {strings.itemQtyLabel}
                </Label>
                <Input
                  id={`item-qty-${item.key}`}
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(event) =>
                    setItems((prev) =>
                      prev.map((row) =>
                        row.key === item.key
                          ? {
                              ...row,
                              quantity: digitsOnly(event.target.value),
                            }
                          : row,
                      ),
                    )
                  }
                  className="min-h-[44px] tabular-nums"
                />
              </div>
              <div className="flex w-28 flex-col gap-1">
                <Label htmlFor={`item-price-${item.key}`}>
                  {strings.itemPriceLabel}
                </Label>
                <Input
                  id={`item-price-${item.key}`}
                  inputMode="numeric"
                  value={item.unitPrice}
                  onChange={(event) =>
                    setItems((prev) =>
                      prev.map((row) =>
                        row.key === item.key
                          ? {
                              ...row,
                              unitPrice: digitsOnly(event.target.value),
                            }
                          : row,
                      ),
                    )
                  }
                  className="min-h-[44px] tabular-nums"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={strings.removeItem}
                title={strings.removeItem}
                onClick={() =>
                  setItems((prev) => prev.filter((row) => row.key !== item.key))
                }
                className="size-11 shrink-0"
              >
                <TrashIcon size={20} aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              keyRef.current += 1;
              setItems((prev) => [
                ...prev,
                { key: keyRef.current, name: "", quantity: "", unitPrice: "" },
              ]);
            }}
            className="min-h-[44px]"
          >
            <PlusIcon size={18} aria-hidden="true" />
            {strings.addItem}
          </Button>
          {itemsError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {itemsError}
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tx-note">{strings.noteLabel}</Label>
          <Input
            id="tx-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={strings.notePlaceholder}
            className="min-h-[44px]"
          />
        </div>

        {mapEnabled ? (
          <fieldset className="flex flex-col gap-3">
            <div className="flex min-h-[44px] items-center justify-between gap-2">
              <label
                htmlFor="tx-location-toggle"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <MapPinIcon size={20} aria-hidden="true" />
                {strings.locationLabel}
              </label>
              <Switch
                id="tx-location-toggle"
                aria-label={strings.locationToggleLabel}
                checked={locationOn}
                onCheckedChange={setLocationOn}
                // why: visual switch hanya 32×18px; padding + margin negatif
                // memperluas area sentuh ke ≥44px tanpa menggeser layout.
                className="p-3.5 -m-3.5"
              />
            </div>
            {locationOn ? (
              <>
                <Suspense
                  fallback={<Skeleton className="h-[240px] rounded-xl" />}
                >
                  <LocationPicker
                    latitude={latitude}
                    longitude={longitude}
                    onPick={(lat, lng) => {
                      setLatitude(lat);
                      setLongitude(lng);
                    }}
                  />
                </Suspense>
                {latitude !== null && longitude !== null ? (
                  <p
                    aria-live="polite"
                    className="text-sm text-muted-foreground tabular-nums"
                  >
                    {strings.locationCoordsLabel}:{" "}
                    {formatCoords(latitude, longitude)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {strings.locationHint}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tx-location-name">
                    {strings.locationNameLabel}
                  </Label>
                  <Input
                    id="tx-location-name"
                    value={locationName}
                    onChange={(event) => setLocationName(event.target.value)}
                    placeholder={strings.locationNamePlaceholder}
                    maxLength={200}
                    className="min-h-[44px]"
                  />
                </div>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {preview ? (
          <p
            aria-live="polite"
            className="rounded-xl bg-muted px-4 py-3 text-sm tabular-nums"
          >
            {strings.balancePreview}: {formatRupiah(preview.before)} →{" "}
            {formatRupiah(preview.after)}
          </p>
        ) : null}

        {serverError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {serverError}
          </p>
        ) : null}

        <div className="flex gap-3 pb-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (dirty) setConfirmDiscard(true);
              else onCancel();
            }}
            className="min-h-[44px] flex-1"
          >
            {strings.cancel}
          </Button>
          <Button
            type="submit"
            disabled={!canSave}
            className="min-h-[44px] flex-1"
          >
            {pending ? strings.saving : strings.save}
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.discardTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {strings.discardConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">
              {strings.keepEditing}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onCancel}
              className="min-h-[44px]"
            >
              {strings.discardYes}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

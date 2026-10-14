import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DISPLAY_NAMES,
  brandKeyFor,
  listInstitutions,
} from "../brands";
import type { AccountType } from "../lib/datasource";
import { strings } from "../strings";
import { AmountField } from "./AmountField";

export interface AccountFormInitial {
  type: AccountType;
  institution: string;
  name: string;
  category: string;
  initialBalance: number;
  showCategory: boolean;
}

export interface AccountFormValues {
  type: AccountType;
  /** Nama final (sudah default ke institusi bila kosong). */
  name: string;
  institution: string;
  category: string;
  initialBalance: number;
  showCategory: boolean;
}

const TYPES: Array<{ value: AccountType; label: string }> = [
  { value: "bank", label: strings.typeBank },
  { value: "ewallet", label: strings.typeEwallet },
  { value: "cash", label: strings.typeCash },
];

/** Nilai Select untuk opsi "Lainnya…" (teks bebas). */
const OTHER_VALUE = "__other__";

interface InstitutionSelection {
  /** Kunci brand, OTHER_VALUE untuk teks bebas, atau null bila belum dipilih. */
  key: string | null;
  /** Draf teks bebas (hanya dipakai bila key = OTHER_VALUE). */
  custom: string;
}

/**
 * Prefill pilihan institusi: institusi tersimpan yang cocok brand (dan
 * se-tab) langsung terpilih; teks kosong berarti belum pilih; sisanya
 * jatuh ke "Lainnya…" dengan teks terisi.
 */
function toSelection(
  type: AccountType,
  institution: string,
): InstitutionSelection {
  if (institution.trim() === "") return { key: null, custom: "" };
  const key = brandKeyFor(institution);
  if (key && listInstitutions(type).some((option) => option.key === key)) {
    return { key, custom: "" };
  }
  return { key: OTHER_VALUE, custom: institution };
}

/** Form akun baru + ubah akun (satu perilaku validasi, Flow 2). */
export function AccountForm({
  initial,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial: AccountFormInitial;
  pending: boolean;
  serverError: string | null;
  onSubmit: (values: AccountFormValues) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<AccountType>(initial.type);
  const [institutionSel, setInstitutionSel] = useState<InstitutionSelection>(
    () => toSelection(initial.type, initial.institution),
  );
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [initialBalance, setInitialBalance] = useState(initial.initialBalance);
  const [showCategory, setShowCategory] = useState(initial.showCategory);
  const [touched, setTouched] = useState({ institution: false, category: false });

  const visibleOptions = useMemo(() => listInstitutions(type), [type]);
  const selectedOption =
    institutionSel.key === null || institutionSel.key === OTHER_VALUE
      ? null
      : (visibleOptions.find((option) => option.key === institutionSel.key) ??
        null);

  /** Institusi final: nama proper brand, atau teks bebas apa adanya. */
  const effectiveInstitution =
    institutionSel.key === null
      ? ""
      : institutionSel.key === OTHER_VALUE
        ? institutionSel.custom.trim()
        : DISPLAY_NAMES[institutionSel.key];

  const institutionError =
    touched.institution && effectiveInstitution === ""
      ? strings.requiredField
      : null;
  const categoryError =
    touched.category && category.trim() === "" ? strings.requiredField : null;

  const canSave =
    effectiveInstitution !== "" && category.trim() !== "" && !pending;

  function handleTypeChange(next: AccountType) {
    setType(next);
    // Pola sama seperti handleKindChange di TransactionForm: pilihan brand
    // yang tak cocok tab baru di-reset; teks bebas dipertahankan karena
    // tidak terikat tab.
    setInstitutionSel((prev) => {
      if (prev.key === null || prev.key === OTHER_VALUE) return prev;
      return listInstitutions(next).some((option) => option.key === prev.key)
        ? prev
        : { key: null, custom: "" };
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ institution: true, category: true });
    if (!canSave) return;
    onSubmit({
      type,
      institution: effectiveInstitution,
      // Nama kustom opsional: default sama dengan institusi.
      name: name.trim() === "" ? effectiveInstitution : name.trim(),
      category: category.trim(),
      initialBalance,
      showCategory,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Tabs value={type} onValueChange={(next) => handleTypeChange(next as AccountType)}>
          <TabsList aria-label={strings.accountTypeLabel} className="h-auto w-full">
            {TYPES.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="min-h-[44px] flex-1"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="account-institution">{strings.institutionLabel}</Label>
        <Select
          value={institutionSel.key}
          onValueChange={(next) => {
            if (next === null) return;
            setInstitutionSel((prev) =>
              next === OTHER_VALUE
                ? { key: OTHER_VALUE, custom: prev.custom }
                : { key: next, custom: "" },
            );
            setTouched((prev) => ({ ...prev, institution: true }));
          }}
        >
          <SelectTrigger id="account-institution" className="min-h-[44px] w-full">
            {selectedOption ? (
              <span className="flex min-w-0 flex-1 truncate text-left">
                {selectedOption.name}
              </span>
            ) : institutionSel.key === OTHER_VALUE ? (
              <span className="flex min-w-0 flex-1 truncate text-left">
                {strings.institutionOther}
              </span>
            ) : (
              <SelectValue placeholder={strings.selectInstitution} />
            )}
          </SelectTrigger>
          <SelectContent>
            {visibleOptions.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_VALUE}>
              {strings.institutionOther}
            </SelectItem>
          </SelectContent>
        </Select>
        {institutionError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {institutionError}
          </p>
        ) : null}
      </div>

      {institutionSel.key === OTHER_VALUE ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-institution-custom">
            {strings.institutionCustomLabel}
          </Label>
          <Input
            id="account-institution-custom"
            value={institutionSel.custom}
            onChange={(event) =>
              setInstitutionSel((prev) => ({
                ...prev,
                custom: event.target.value,
              }))
            }
            onBlur={() => setTouched((prev) => ({ ...prev, institution: true }))}
            placeholder={strings.institutionPlaceholder}
            maxLength={200}
            aria-invalid={institutionError !== null}
            className="min-h-[44px]"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="account-name">{strings.customNameLabel}</Label>
        <Input
          id="account-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={strings.customNamePlaceholder}
          maxLength={200}
          className="min-h-[44px]"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="account-category">{strings.accountCategoryLabel}</Label>
        <Input
          id="account-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          onBlur={() => setTouched((prev) => ({ ...prev, category: true }))}
          placeholder={strings.accountCategoryPlaceholder}
          maxLength={200}
          aria-invalid={categoryError !== null}
          className="min-h-[44px]"
        />
        {categoryError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {categoryError}
          </p>
        ) : null}
      </div>

      <AmountField
        id="account-initial-balance"
        label={strings.openingBalanceLabel}
        value={initialBalance}
        onChange={setInitialBalance}
      />

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Label htmlFor="account-show-category">
            {strings.showCategoryLabel}
          </Label>
          <p className="text-xs text-muted-foreground">
            {strings.showCategoryHint}
          </p>
        </div>
        <Switch
          id="account-show-category"
          checked={showCategory}
          onCheckedChange={setShowCategory}
          aria-label={strings.showCategoryLabel}
          // why: visual switch hanya 32×18px; padding + margin negatif
          // memperluas area sentuh ke ≥44px tanpa menggeser layout.
          className="p-3.5 -m-3.5"
        />
      </div>

      {serverError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex gap-3 pb-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
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
  );
}

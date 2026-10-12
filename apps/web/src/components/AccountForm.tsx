import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccountType } from "../lib/queries";
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
  const [institution, setInstitution] = useState(initial.institution);
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [initialBalance, setInitialBalance] = useState(initial.initialBalance);
  const [showCategory, setShowCategory] = useState(initial.showCategory);
  const [touched, setTouched] = useState({ institution: false, category: false });

  const institutionError =
    touched.institution && institution.trim() === ""
      ? strings.requiredField
      : null;
  const categoryError =
    touched.category && category.trim() === "" ? strings.requiredField : null;

  const canSave =
    institution.trim() !== "" && category.trim() !== "" && !pending;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ institution: true, category: true });
    if (!canSave) return;
    onSubmit({
      type,
      institution: institution.trim(),
      // Nama kustom opsional: default sama dengan institusi.
      name: name.trim() === "" ? institution.trim() : name.trim(),
      category: category.trim(),
      initialBalance,
      showCategory,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Tabs value={type} onValueChange={(next) => setType(next as AccountType)}>
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
        <Input
          id="account-institution"
          value={institution}
          onChange={(event) => setInstitution(event.target.value)}
          onBlur={() => setTouched((prev) => ({ ...prev, institution: true }))}
          placeholder={strings.institutionPlaceholder}
          maxLength={200}
          aria-invalid={institutionError !== null}
          className="min-h-[44px]"
        />
        {institutionError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {institutionError}
          </p>
        ) : null}
      </div>

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

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { digitsOnly, formatGrouped, parsePositiveInt } from "../lib/format";
import { strings } from "../strings";

const CHIPS = [
  { label: strings.chip10k, value: 10_000 },
  { label: strings.chip20k, value: 20_000 },
  { label: strings.chip50k, value: 50_000 },
  { label: strings.chip100k, value: 100_000 },
];

/**
 * Input nominal integer + chips cepat. Induk memegang integer rupiah;
 * teks tampilan (pemformat ribuan) dikelola di sini dan disinkronkan
 * saat nilai induk berubah dari luar (mis. tombol chip).
 */
export function AmountField({
  id,
  label,
  value,
  onChange,
  showChips = true,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  showChips?: boolean;
}) {
  const [text, setText] = useState(value > 0 ? formatGrouped(value) : "");

  useEffect(() => {
    if (parsePositiveInt(text) !== value) {
      setText(value > 0 ? formatGrouped(value) : "");
    }
    // Sinkron satu arah dari induk saja; `text` milik state lokal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        value={text}
        onChange={(event) => {
          const digits = digitsOnly(event.target.value);
          setText(digits === "" ? "" : formatGrouped(Number(digits)));
          onChange(digits === "" ? 0 : Number(digits));
        }}
        className="min-h-[44px] tabular-nums"
      />
      {showChips ? (
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <Button
              key={chip.value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(value + chip.value)}
              className="min-h-[44px] tabular-nums"
            >
              {chip.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

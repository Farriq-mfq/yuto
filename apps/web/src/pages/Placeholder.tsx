import { strings } from "../strings";

export default function Placeholder({ title }: { title: string }) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col items-center bg-background px-4 pb-24 pt-6">
      <h1 className="font-display text-xl font-bold">{title}</h1>
      <p className="mt-4 text-sm text-muted-foreground">{strings.comingSoon}</p>
    </main>
  );
}

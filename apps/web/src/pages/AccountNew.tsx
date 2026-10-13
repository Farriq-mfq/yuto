import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AccountForm,
  type AccountFormValues,
} from "@/components/AccountForm";
import { api, isUnauthorized } from "../lib/api";
import { strings } from "../strings";

export default function AccountNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit(values: AccountFormValues) {
    if (pending) return;
    setPending(true);
    setServerError(null);
    const { error } = await api.api.accounts.post({
      name: values.name,
      institution: values.institution,
      type: values.type,
      category: values.category,
      initialBalance: values.initialBalance,
      showCategory: values.showCategory,
    });
    setPending(false);
    if (error) {
      if (isUnauthorized(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setServerError(strings.saveFailed);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    navigate("/wallet", { replace: true });
  }

  return (
    <main
      id="konten-utama"
      tabIndex={-1}
      className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5"
    >
      <h1 className="font-display text-xl font-bold">
        {strings.newAccountTitle}
      </h1>
      <AccountForm
        initial={{
          type: "bank",
          institution: "",
          name: "",
          category: "",
          initialBalance: 0,
          showCategory: true,
        }}
        pending={pending}
        serverError={serverError}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/wallet")}
      />
    </main>
  );
}

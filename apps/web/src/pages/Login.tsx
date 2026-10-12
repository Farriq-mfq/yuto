import { yutoSvg } from "@/logo";
import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorStatus } from "../lib/api";
import { strings } from "../strings";

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || password.length === 0) return;
    setPending(true);
    setMessage(null);
    const { error } = await api.api.auth.login.post({ password });
    setPending(false);
    if (!error) {
      navigate("/", { replace: true });
      return;
    }
    const status = errorStatus(error);
    if (status === 401) setMessage(strings.loginWrongPassword);
    else if (status === 429) setMessage(strings.loginTooMany);
    else setMessage(strings.loginFailed);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center bg-background px-4 pb-16 pt-8 min-[380px]:px-6">
      <Card>
        <CardHeader>
          <img
            src={yutoSvg}
            alt={strings.appLogoAlt}
            width={56}
            height={56}
            className="mb-1 h-14 w-14 rounded-2xl"
          />
          <h1 className="font-display text-2xl font-bold">{strings.loginTitle}</h1>
          <CardDescription>{strings.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{strings.passwordLabel}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={strings.passwordPlaceholder}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-[44px]"
              />
            </div>
            {message ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {message}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={pending || password.length === 0}
              className="min-h-[44px]"
            >
              {pending ? strings.loginLoading : strings.loginButton}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

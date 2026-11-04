import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { t } from "@/lib/i18n";
import { useJournal } from "@/lib/journal";
import { Card } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "로그인 · my dear step" },
      {
        name: "description",
        content: "로그인하고 나의 GLP-1 기록과 사진을 내 계정에 안전하게 보관하세요.",
      },
      { property: "og:title", content: "로그인 · my dear step" },
      { property: "og:description", content: "기록과 사진을 내 계정에만 안전하게 보관해요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const j = useJournal();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(false);

  useEffect(() => {
    if (j.user) navigate({ to: "/today", replace: true });
  }, [j.user, navigate]);

  async function perform(action: () => Promise<void>) {
    if (request.current) return;
    request.current = true;
    setMsg(null);
    setBusy(true);
    try {
      await action();
    } catch {
      setMsg({ kind: "err", text: t("auth.unavailable") });
    } finally {
      request.current = false;
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (request.current) return;
    if (pw.length < 8) return setMsg({ kind: "err", text: t("auth.short") });
    await perform(async () => {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) setMsg({ kind: "err", text: error.message });
        else if (!data.session) setMsg({ kind: "ok", text: t("auth.check") });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) setMsg({ kind: "err", text: t("auth.fail") });
      }
    });
  }

  async function social(p: "google" | "lovable") {
    await perform(async () => {
      const r = await lovable.auth.signInWithOAuth(p, { redirect_uri: window.location.origin });
      if (r.error) setMsg({ kind: "err", text: t("auth.fail") });
    });
  }

  return (
    <div className="mx-auto max-w-md pb-10 pt-4">
      <h1 className="pt-3 text-[30px] font-semibold leading-tight tracking-tight">
        {t("auth.title")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("auth.sub")}</p>
      <Card className="mt-6 p-5">
        <Button
          variant="unstyled"
          size="unstyled"
          type="button"
          onClick={() => social("google")}
          disabled={busy}
          className="press h-12 w-full rounded-full border bg-card text-sm font-medium"
        >
          {t("auth.google")}
        </Button>
        <Button
          variant="unstyled"
          size="unstyled"
          type="button"
          onClick={() => social("lovable")}
          disabled={busy}
          className="lovable-auth-button mt-2 w-full"
        >
          {t("auth.lovable")}
        </Button>
        {busy && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {t("auth.connecting")}
          </p>
        )}
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("auth.or")}
          <span className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={submit} className="journal-form feel-form space-y-4" aria-busy={busy}>
          <label className="block text-sm">
            {t("auth.email")}
            <input
              type="email"
              required
              autoComplete="email"
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-12 w-full rounded-[14px] border bg-background px-4"
            />
          </label>
          <label className="block text-sm">
            {t("auth.password")}
            <input
              type="password"
              required
              minLength={8}
              disabled={busy}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="mt-1 h-12 w-full rounded-[14px] border bg-background px-4"
            />
          </label>
          {msg && (
            <p
              role={msg.kind === "err" ? "alert" : "status"}
              className={msg.kind === "err" ? "text-sm text-destructive" : "text-sm text-primary"}
            >
              {msg.text}
            </p>
          )}
          <Button
            variant="unstyled"
            size="unstyled"
            disabled={busy}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy && <LoaderCircle className="feel-busy size-5" />}
            {mode === "up" ? t("auth.signup") : t("auth.signin")}
          </Button>
        </form>
        <Button
          variant="unstyled"
          size="unstyled"
          type="button"
          disabled={busy}
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setMsg(null);
          }}
          className="mt-3 h-11 w-full text-sm text-primary underline-offset-4 hover:underline"
        >
          {mode === "in" ? t("auth.toSignup") : t("auth.toSignin")}
        </Button>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">{t("auth.first")}</p>
      <Link
        to="/today"
        className="mt-3 inline-flex h-11 items-center text-sm text-muted-foreground underline underline-offset-4"
      >
        {t("auth.later")}
      </Link>
    </div>
  );
}

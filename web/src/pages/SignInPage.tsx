import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { friendly, type Step } from "@/lib/auth-errors";

const copy: Record<Step, { title: string; description: string; submit: string }> = {
  signIn: { title: "Sign in", description: "Your AI keys and app connections.", submit: "Sign in" },
  signUp: { title: "Create account", description: "Only emails on the allowlist can sign up.", submit: "Create account" },
  verify: { title: "Check your email", description: "Enter the 6-digit code we sent you.", submit: "Verify" },
  forgot: { title: "Reset password", description: "We'll email you a 6-digit code.", submit: "Send code" },
  reset: { title: "Choose a new password", description: "Enter the code from your email.", submit: "Reset password" },
};

// Each step sends one Convex Auth Password flow.
const flows: Record<Step, string> = {
  signIn: "signIn",
  signUp: "signUp",
  verify: "email-verification",
  forgot: "reset",
  reset: "reset-verification",
};

/**
 * Email + password, with a code by email to verify the address at sign-up
 * (and on sign-in if it never was) and to reset a forgotten password.
 */
export function SignInPage() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<Step>("signIn");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go(next: Step) {
    setStep(next);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("email", email);
    formData.set("flow", flows[step]);
    try {
      const { signingIn } = await signIn("password", formData);
      // Not signed in yet means a code was emailed: sign-up, an unverified
      // sign-in, or a reset request.
      if (!signingIn) go(step === "forgot" ? "reset" : "verify");
    } catch (err) {
      setError(friendly(err, step));
    } finally {
      setBusy(false);
    }
  }

  const { title, description, submit: submitLabel } = copy[step];
  const codeStep = step === "verify" || step === "reset";

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <img src="/favicon.svg?v=2" alt="" className="size-7" />
            <span className="font-semibold">Kunji</span>
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{codeStep ? `${description} (${email})` : description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} key={step}>
            <FieldGroup>
              {!codeStep && (
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              )}
              {codeStep && (
                <Field>
                  <FieldLabel htmlFor="code">Code</FieldLabel>
                  <Input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </Field>
              )}
              {(step === "signIn" || step === "signUp" || step === "reset") && (
                <Field>
                  <FieldLabel htmlFor="password">{step === "reset" ? "New password" : "Password"}</FieldLabel>
                  <Input
                    id="password"
                    name={step === "reset" ? "newPassword" : "password"}
                    type="password"
                    minLength={8}
                    autoComplete={step === "signIn" ? "current-password" : "new-password"}
                    required
                  />
                </Field>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" size="lg" disabled={busy}>
                {busy && <Spinner />}
                {submitLabel}
              </Button>
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                {step === "signIn" && (
                  <>
                    <LinkButton onClick={() => go("forgot")}>Forgot password?</LinkButton>
                    <LinkButton onClick={() => go("signUp")}>First time? Create your account</LinkButton>
                  </>
                )}
                {step !== "signIn" && <LinkButton onClick={() => go("signIn")}>Back to sign in</LinkButton>}
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" className="underline-offset-4 hover:text-foreground hover:underline" onClick={onClick}>
      {children}
    </button>
  );
}

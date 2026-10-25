/** Parses a comma-separated email list env var into normalized emails. */
function emailList(name: "ALLOWED_EMAILS" | "ADMIN_EMAILS"): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function allowedEmails(): string[] {
  return emailList("ALLOWED_EMAILS");
}

export function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.trim().toLowerCase());
}

/** Admins manage the app registry. They must also be in ALLOWED_EMAILS to sign in. */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return emailList("ADMIN_EMAILS").includes(email.trim().toLowerCase());
}

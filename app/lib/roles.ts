// Role-based access control
// null = full access, string[] = restricted to these paths only

const RESTRICTED: Record<string, string[]> = {
  "mitch.caluzakpg07@gmail.com": ["/returns"],
};

export function getAllowedPaths(email?: string | null): string[] | null {
  if (!email) return null;
  return RESTRICTED[email.toLowerCase()] ?? null;
}

export function canAccess(email: string | null | undefined, pathname: string): boolean {
  const allowed = getAllowedPaths(email);
  if (allowed === null) return true;
  return allowed.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export function defaultPath(email: string | null | undefined): string {
  const allowed = getAllowedPaths(email);
  return allowed?.[0] ?? "/";
}

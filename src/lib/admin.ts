const ADMIN_LIST = (process.env.ADMIN_USERNAMES ?? "blueming,admin")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(username: string | null | undefined): boolean {
  if (!username) return false;
  return ADMIN_LIST.includes(username.toLowerCase());
}

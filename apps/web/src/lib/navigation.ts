export function isWorkspacePath(path: string): boolean {
  return ["/dashboard", "/exams", "/assessments", "/subscriptions", "/account", "/payment"].some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

/** The admin panel has its own shell; it is not part of the student workspace. */
export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

export function isActivePath(path: string, href: string): boolean {
  if (href === "/dashboard") return path === href || path.startsWith("/assessments/");
  return path === href || path.startsWith(`${href}/`);
}

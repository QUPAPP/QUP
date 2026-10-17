export function isWorkspacePath(path: string): boolean {
  return ["/dashboard", "/exams", "/assessments", "/subscriptions", "/account", "/payment"].some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

export function isActivePath(path: string, href: string): boolean {
  if (href === "/dashboard") return path === href || path.startsWith("/assessments/");
  return path === href || path.startsWith(`${href}/`);
}

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
  // A taxonomy version is reached from its exam; it belongs to the same item.
  if (href === "/admin/exams" && path.startsWith("/admin/taxonomy-versions/")) return true;
  if (href === "/admin/exams" && path.startsWith("/admin/blueprints/")) return true;
  // Likewise a question version belongs to the question bank.
  if (href === "/admin/questions" && path.startsWith("/admin/question-versions/")) return true;
  return path === href || path.startsWith(`${href}/`);
}

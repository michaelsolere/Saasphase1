/**
 * Classification of Next.js app routes for the private sidebar shell.
 *
 * Default-safe rule for authenticated users:
 *   show sidebar unless the path is an explicit public or standalone private route.
 * Unknown private paths therefore get the shell automatically (no private whitelist).
 */

/** Explicit public marketing / auth / intake surfaces (no sidebar). */
export const PUBLIC_APP_ROUTES = ["/login", "/candidature", "/suivi"] as const;

/**
 * Authenticated surfaces that intentionally omit the desktop sidebar.
 * `/whelping` is the mobile midwifery PWA entry (tests assert no shell).
 */
export const STANDALONE_PRIVATE_APP_ROUTES = ["/whelping"] as const;

const sidebarCollapsedStorageKey = "main-sidebar-collapsed";

export { sidebarCollapsedStorageKey };

function matchesRoutePrefix(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_APP_ROUTES.some((route) => matchesRoutePrefix(pathname, route));
}

export function isStandalonePrivateRoute(pathname: string): boolean {
  return STANDALONE_PRIVATE_APP_ROUTES.some((route) =>
    matchesRoutePrefix(pathname, route),
  );
}

/**
 * Whether the private desktop sidebar shell should wrap the page.
 * Requires an authenticated session; public and standalone private routes stay bare.
 */
export function shouldShowPrivateSidebar(
  pathname: string,
  isAuthenticated: boolean,
): boolean {
  if (!isAuthenticated) return false;
  if (isPublicRoute(pathname)) return false;
  if (isStandalonePrivateRoute(pathname)) return false;
  return true;
}

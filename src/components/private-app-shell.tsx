"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MainSidebar } from "@/components/main-sidebar";
import { createClient } from "@/lib/supabase/client";

const publicRoutes = ["/login", "/candidature"];
const privateRoutes = [
  "/animals",
  "/candidatures",
  "/cheptel",
  "/contacts",
  "/documents",
  "/form-submissions",
  "/litter-groups",
  "/litters",
  "/payments",
  "/reservations",
  "/settings",
];
const sidebarCollapsedStorageKey = "main-sidebar-collapsed";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

function isPublicRoute(pathname: string) {
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isPrivateRoute(pathname: string) {
  return privateRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function PrivateAppShell({
  children,
  initialIsAuthenticated,
}: Readonly<{
  children: React.ReactNode;
  initialIsAuthenticated: boolean;
}>) {
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    initialIsAuthenticated ? "authenticated" : "loading",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      setSidebarCollapsed(
        window.sessionStorage.getItem(sidebarCollapsedStorageKey) === "true",
      );
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setAuthStatus(data.session ? "authenticated" : "unauthenticated");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthStatus(session ? "authenticated" : "unauthenticated");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAuthenticated = authStatus === "authenticated";
  const shouldShowSidebar =
    !isPublicRoute(pathname) &&
    (isPrivateRoute(pathname) || (pathname === "/" && isAuthenticated));

  if (!shouldShowSidebar) {
    return children;
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.sessionStorage.setItem(sidebarCollapsedStorageKey, String(next));
      return next;
    });
  }

  return (
    <div
      className="private-shell"
      data-collapsed={sidebarCollapsed ? "true" : "false"}
      data-auth-status={authStatus}
      data-private-shell=""
      data-should-show-sidebar={shouldShowSidebar ? "true" : "false"}
    >
      <div className="private-sidebar-desktop" data-sidebar-desktop="">
        <div className="sticky top-0 h-screen">
          <MainSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
          />
        </div>
      </div>

      <div className="private-content" data-private-content="">
        {children}
      </div>
    </div>
  );
}

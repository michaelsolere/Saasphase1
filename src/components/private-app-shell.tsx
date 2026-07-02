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
  "/litter-groups",
  "/litters",
  "/payments",
  "/reservations",
  "/settings",
];
const sidebarCollapsedStorageKey = "main-sidebar-collapsed";

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
  const [isAuthenticated, setIsAuthenticated] = useState(
    initialIsAuthenticated,
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

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setIsAuthenticated(Boolean(data.user));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const shouldShowSidebar =
    !isPublicRoute(pathname) && (isPrivateRoute(pathname) || (pathname === "/" && isAuthenticated));

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
      data-private-shell=""
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

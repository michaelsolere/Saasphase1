"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MainSidebar } from "@/components/main-sidebar";
import { createClient } from "@/lib/supabase/client";
import {
  isPublicRoute,
  isStandalonePrivateRoute,
  shouldShowPrivateSidebar,
  sidebarCollapsedStorageKey,
} from "@/lib/private-route-shell";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function PrivateAppShell({
  children,
  initialIsAuthenticated,
  positioningAttentionCount,
}: Readonly<{
  children: React.ReactNode;
  initialIsAuthenticated: boolean;
  positioningAttentionCount: number;
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
  const shouldShowSidebar = shouldShowPrivateSidebar(pathname, isAuthenticated);

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
      data-public-route={isPublicRoute(pathname) ? "true" : "false"}
      data-standalone-private-route={
        isStandalonePrivateRoute(pathname) ? "true" : "false"
      }
    >
      <div className="private-sidebar-desktop" data-sidebar-desktop="">
        <div className="sticky top-0 h-screen">
          <MainSidebar
            collapsed={sidebarCollapsed}
            positioningAttentionCount={positioningAttentionCount}
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

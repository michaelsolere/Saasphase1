"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MainSidebar } from "@/components/main-sidebar";
import { createClient } from "@/lib/supabase/client";
import {
  isPublicRoute,
  isStandalonePrivateRoute,
  canRenderPrivateShell,
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
  // Trust the server-rendered auth state until Supabase proves otherwise:
  // "unauthenticated" is only reachable after an actual negative session
  // check, never from the transient "loading" phase (prevents the sidebar
  // flashing off right after login redirects).
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    initialIsAuthenticated ? "authenticated" : "loading",
  );
  const hasResolvedSessionRef = useRef(false);
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
        hasResolvedSessionRef.current = true;
        if (!data.session && !initialIsAuthenticated) {
          setAuthStatus("unauthenticated");
        } else if (data.session) {
          setAuthStatus("authenticated");
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      // Ignore sign-in events that merely confirm the server-known state;
      // only act once the initial session lookup has settled. The stale
      // closure on hasResolvedSession is intentional: this guard only needs
      // the value captured when the effect mounted (initial lookup pending).
      setAuthStatus((current) => {
        if (!hasResolvedSessionRef.current) return current;
        return session ? "authenticated" : "unauthenticated";
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initialIsAuthenticated]);

  const canRenderShell = canRenderPrivateShell(authStatus);
  const shouldShowSidebar = shouldShowPrivateSidebar(pathname, canRenderShell);

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

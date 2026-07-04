"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Banknote,
  ChevronDown,
  ClipboardList,
  Contact,
  Dog,
  FileText,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { logout } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

type SidebarItem = {
  label: string;
  href?: string;
  activeHrefs?: string[];
  comingSoon?: boolean;
};

type SidebarSection = {
  label: string;
  icon: LucideIcon;
  href?: string;
  items?: SidebarItem[];
};

const sections: SidebarSection[] = [
  {
    label: "Tableau de bord",
    href: "/",
    icon: Home,
  },
  {
    label: "Contacts",
    icon: Users,
    items: [
      { label: "Tous les contacts", href: "/contacts" },
      { label: "Candidats", href: "/candidatures" },
      { label: "Adoptants", comingSoon: true },
      { label: "Anciens adoptants", comingSoon: true },
      { label: "Partenaires", comingSoon: true },
    ],
  },
  {
    label: "Parcours adoptants",
    icon: ClipboardList,
    items: [
      { label: "En cours", href: "/reservations" },
      { label: "À suivre", comingSoon: true },
      { label: "Finalisés", comingSoon: true },
    ],
  },
  {
    label: "Paiements",
    icon: Banknote,
    items: [
      {
        label: "Paiements attendus",
        href: "/payments?filter=expected",
        activeHrefs: ["/payments"],
      },
      { label: "Paiements reçus", href: "/payments?filter=received" },
      { label: "Remboursements / avoirs", comingSoon: true },
    ],
  },
  {
    label: "Documents",
    icon: FileText,
    items: [
      { label: "Documents en cours", href: "/documents" },
      { label: "Documents archivés", comingSoon: true },
      { label: "Modèles d’emails", href: "/documents/email-templates" },
      { label: "Modèles de contrats", comingSoon: true },
    ],
  },
  {
    label: "Portées",
    icon: PawPrint,
    items: [
      { label: "Actuelles", href: "/litters" },
      { label: "Passées", comingSoon: true },
    ],
  },
  {
    label: "Animaux",
    icon: Dog,
    items: [
      { label: "Cheptel", href: "/cheptel" },
      { label: "Étalons extérieurs", href: "/animals?filter=external_breeders" },
      { label: "Chiots / chatons à l’élevage", href: "/animals?filter=born" },
      { label: "Animaux adoptés", href: "/animals?filter=adopted" },
    ],
  },
];

const sectionLabels = sections
  .filter((section) => section.items)
  .map((section) => section.label);
const sidebarScrollStorageKey = "main-sidebar-scroll";
const openSectionsStorageKey = "main-sidebar-open-sections";

function getHrefParts(href: string) {
  const [path, query = ""] = href.split("?");

  return {
    path,
    query: normalizeQuery(query),
    hasQuery: href.includes("?"),
  };
}

function normalizeQuery(query: string) {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams(query);
  params.sort();

  return params.toString();
}

function queryIncludes(search: string, query: string) {
  const currentParams = new URLSearchParams(search);
  const hrefParams = new URLSearchParams(query);

  for (const [key, value] of hrefParams.entries()) {
    if (currentParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}

function isDirectHrefActive(
  pathname: string,
  search: string,
  href?: string,
  options: { ignoreSearchForPath?: boolean } = {},
) {
  if (!href) {
    return false;
  }

  const { path, query, hasQuery } = getHrefParts(href);

  if (path === "/") {
    return pathname === "/" && !search && !hasQuery;
  }

  if (hasQuery) {
    return pathname === path && queryIncludes(search, query);
  }

  return (
    (options.ignoreSearchForPath || !search) &&
    (pathname === path || pathname.startsWith(`${path}/`))
  );
}

function getHrefActiveScore(
  pathname: string,
  search: string,
  href?: string,
  options: { ignoreSearchForPath?: boolean } = {},
) {
  if (!isDirectHrefActive(pathname, search, href, options) || !href) {
    return -1;
  }

  const { path, query, hasQuery } = getHrefParts(href);

  return path.length + (hasQuery ? 1_000 + query.length : 0);
}

function isItemActive(pathname: string, search: string, item: SidebarItem) {
  return (
    isDirectHrefActive(pathname, search, item.href, {
      ignoreSearchForPath: true,
    }) ||
    Boolean(
      item.activeHrefs?.some((activeHref) =>
        isDirectHrefActive(pathname, search, activeHref),
      ),
    )
  );
}

function getActiveItemIndex(
  pathname: string,
  search: string,
  items: SidebarItem[] = [],
) {
  let bestMatch = {
    index: -1,
    score: -1,
  };

  for (const [index, item] of items.entries()) {
    if (!item.href || !isItemActive(pathname, search, item)) {
      continue;
    }

    const directScore = getHrefActiveScore(pathname, search, item.href, {
      ignoreSearchForPath: true,
    });
    const aliasScore = Math.max(
      -1,
      ...(item.activeHrefs?.map((activeHref) =>
        getHrefActiveScore(pathname, search, activeHref),
      ) ?? []),
    );
    const score = Math.max(directScore, aliasScore);

    if (score > bestMatch.score) {
      bestMatch = { index, score };
    }
  }

  return bestMatch.index;
}

function sectionHasActiveItem(
  pathname: string,
  search: string,
  section: SidebarSection,
) {
  return (
    isDirectHrefActive(pathname, search, section.href) ||
    getActiveItemIndex(pathname, search, section.items) !== -1
  );
}

function parseStoredOpenSections(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return null;
    }

    return new Set(
      parsed.filter(
        (label): label is string =>
          typeof label === "string" && sectionLabels.includes(label),
      ),
    );
  } catch {
    return null;
  }
}

function getDefaultOpenSections(pathname: string, search: string) {
  return new Set(
    sections
      .filter((section) => section.items && sectionHasActiveItem(pathname, search, section))
      .map((section) => section.label),
  );
}

function SidebarLink({
  item,
  onNavigate,
  collapsed,
  active,
}: {
  item: SidebarItem;
  onNavigate?: () => void;
  collapsed?: boolean;
  active?: boolean;
}) {
  if (item.comingSoon || !item.href) {
    return (
      <div
        className={cn(
          "flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-muted",
          collapsed && "justify-center px-2",
        )}
        aria-disabled="true"
        title={collapsed ? `${item.label} - À venir` : undefined}
      >
        <span className={cn("min-w-0 truncate", collapsed && "sr-only")}>
          {item.label}
        </span>
        {collapsed ? (
          <span className="h-2 w-2 rounded-full bg-muted" aria-hidden="true" />
        ) : (
          <span className="shrink-0 rounded-full border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
            À venir
          </span>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex min-h-9 min-w-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition",
        collapsed && "justify-center px-2",
        active
          ? "bg-accent-soft text-accent"
          : "text-muted hover:bg-background hover:text-foreground",
      )}
    >
      <span className={cn("min-w-0 truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
      {collapsed ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

export function MainSidebar({
  collapsed = false,
  onNavigate,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = normalizeQuery(searchParams.toString());
  const navRef = useRef<HTMLElement | null>(null);
  const [logoutPending, startLogoutTransition] = useTransition();
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => getDefaultOpenSections(pathname, currentSearch),
  );

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const storedOpenSections = parseStoredOpenSections(
        window.sessionStorage.getItem(openSectionsStorageKey),
      );

      if (storedOpenSections) {
        setOpenSections(storedOpenSections);
      }
    });
  }, []);

  useEffect(() => {
    const nav = navRef.current;

    if (!nav) {
      return;
    }

    const storedScrollTop = window.sessionStorage.getItem(
      sidebarScrollStorageKey,
    );

    if (!storedScrollTop) {
      return;
    }

    window.requestAnimationFrame(() => {
      nav.scrollTop = Number(storedScrollTop) || 0;
    });
  }, [pathname, collapsed]);

  function saveScrollPosition() {
    const nav = navRef.current;

    if (!nav) {
      return;
    }

    window.sessionStorage.setItem(
      sidebarScrollStorageKey,
      String(nav.scrollTop),
    );
  }

  function handleNavigate() {
    saveScrollPosition();
    onNavigate?.();
  }

  function toggleSection(label: string) {
    saveScrollPosition();

    setOpenSections((current) => {
      const next = new Set(current);

      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }

      window.sessionStorage.setItem(
        openSectionsStorageKey,
        JSON.stringify(Array.from(next)),
      );

      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r bg-surface",
        collapsed ? "items-stretch" : "",
      )}
      data-testid="main-sidebar"
      aria-label="Navigation principale privée"
    >
      <div className={cn("border-b py-4", collapsed ? "px-2" : "px-4")}>
        <Link
          href="/"
          onClick={handleNavigate}
          className={cn(
            "flex min-w-0 items-center rounded-lg text-left",
            collapsed ? "justify-center" : "gap-3",
          )}
          title={collapsed ? "SaaS Élevage" : undefined}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
            <Contact className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className={cn("min-w-0", collapsed && "sr-only")}>
            <span className="block text-sm font-semibold">SaaS Élevage</span>
            <span className="block text-xs text-muted">Espace privé</span>
          </span>
        </Link>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "mt-4 flex min-h-9 w-full min-w-0 items-center rounded-lg border px-3 py-2 text-sm font-semibold text-muted transition hover:bg-background hover:text-foreground",
              collapsed ? "justify-center px-2" : "gap-2",
            )}
            aria-label={collapsed ? "Déplier la navigation" : "Replier la navigation"}
            title={collapsed ? "Déplier" : undefined}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
            <span className={cn(collapsed && "sr-only")}>
              {collapsed ? "Déplier" : "Replier"}
            </span>
          </button>
        ) : null}
      </div>

      <nav
        ref={navRef}
        onScroll={saveScrollPosition}
        className={cn(
          "sidebar-scroll min-h-0 flex-1 py-3",
          collapsed ? "px-2" : "px-3",
        )}
        aria-label="Navigation principale privée"
      >
        <div className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const activeItemIndex = getActiveItemIndex(
              pathname,
              currentSearch,
              section.items,
            );
            const active = sectionHasActiveItem(
              pathname,
              currentSearch,
              section,
            );
            const sectionOpen =
              !collapsed && openSections.has(section.label);

            if (section.href) {
              return (
                <Link
                  key={section.label}
                  href={section.href}
                  onClick={handleNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? section.label : undefined}
                  className={cn(
                    "flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition",
                    collapsed && "justify-center px-2",
                    active
                      ? "bg-accent !text-white hover:!text-white focus-visible:!text-white"
                      : "text-foreground hover:bg-background hover:text-foreground focus-visible:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className={cn("min-w-0 truncate", collapsed && "sr-only")}>
                    {section.label}
                  </span>
                </Link>
              );
            }

            return (
              <div key={section.label} className="rounded-lg">
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  aria-expanded={sectionOpen}
                  title={collapsed ? section.label : undefined}
                  className={cn(
                    "flex min-h-10 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
                    collapsed && "justify-center px-2",
                    active
                      ? "bg-accent !text-white hover:!text-white focus-visible:!text-white"
                      : "text-foreground hover:bg-background hover:text-foreground focus-visible:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>
                    {section.label}
                  </span>
                  {!collapsed ? (
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition",
                        sectionOpen && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
                {sectionOpen ? (
                  <div className="mt-1 min-w-0 space-y-1 pl-5">
                  {section.items?.map((item, index) => (
                    <SidebarLink
                      key={`${section.label}-${item.label}`}
                      item={item}
                      onNavigate={handleNavigate}
                      collapsed={collapsed}
                      active={index === activeItemIndex}
                    />
                  ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>

      <div className={cn("border-t p-3", collapsed && "px-2")}>
        <button
          type="button"
          disabled={logoutPending}
          onClick={() => startLogoutTransition(() => logout())}
          className={cn(
            "flex min-h-10 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:bg-background hover:text-foreground disabled:cursor-wait disabled:opacity-60",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Se déconnecter" : undefined}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className={cn("min-w-0 truncate", collapsed && "sr-only")}>
            Se déconnecter
          </span>
        </button>
      </div>
    </aside>
  );
}

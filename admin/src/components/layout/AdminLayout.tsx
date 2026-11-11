import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMarketplaceEnabled } from "@/features/marketplace/api";

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import {

  ArrowUpRight,
  Aperture,
  ChevronRight,
  PanelLeftClose,
  Search,
  X,

  Clapperboard,

  FileVideo,

  Film,

  Image,

  Layers,

  LayoutDashboard,

  ListVideo,

  LogOut,

  Maximize2,


  Receipt,

  Scale,

  Settings,

  Shapes,

  Users,

  Wallet,

} from "lucide-react";

import { clearAuth, getCachedUser } from "@/lib/auth";

import { cn } from "@/lib/utils";
import { LOCALES, useI18n } from "@/i18n";
import { AdminNavigationSearch } from "./AdminNavigationSearch";

// 导航与标题只存 labelKey：模块级常量在导入时求值，存翻译后的文字会固化成首次加载时的语言
type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  matchPrefix?: boolean;
};

type NavGroup = {
  id: string;
  labelKey: string;
  items: NavItem[];
};

/** 渲染用：labelKey 已翻译成当前语言 */
type TranslatedNavGroup = { id: string; label: string; items: Array<Omit<NavItem, "labelKey"> & { label: string }> };

const navGroups: NavGroup[] = [
  { id: "overview", labelKey: "layout.overview", items: [{ to: "/", labelKey: "layout.dashboard", icon: LayoutDashboard, end: true }] },
  {
    id: "business",
    labelKey: "layout.business",
    items: [
      { to: "/users", labelKey: "layout.users", icon: Users },
      { to: "/teams", labelKey: "layout.teams", icon: Users, matchPrefix: true },
      { to: "/orders", labelKey: "layout.ordersLedger", icon: Receipt },
      { to: "/adjustments", labelKey: "layout.adjustments", icon: Scale },
      { to: "/finance", labelKey: "layout.finance", icon: Wallet },
      { to: "/projects", labelKey: "layout.explainerProjects", icon: Clapperboard },
      { to: "/works", labelKey: "layout.workReview", icon: FileVideo },
    ],
  },
  {
    id: "drama",
    labelKey: "layout.drama",
    items: [
      { to: "/drama-projects", labelKey: "layout.dramaProjects", icon: Film, matchPrefix: true },
      { to: "/drama-assets", labelKey: "layout.assetLibrary", icon: Image, matchPrefix: true },
      { to: "/drama-episodes", labelKey: "layout.episodes", icon: ListVideo, matchPrefix: true },
      { to: "/drama-fragments", labelKey: "layout.shots", icon: Layers, matchPrefix: true },
    ],
  },
  {
    id: "resources",
    labelKey: "layout.resources",
    items: [
      { to: "/templates", labelKey: "layout.templates", icon: Shapes },
      { to: "/queues", labelKey: "layout.taskCenter", icon: Layers },
    ],
  },
  { id: "system", labelKey: "layout.system", items: [{ to: "/settings", labelKey: "layout.systemSettings", icon: Settings }] },
];

const titleKeys: Record<string, string> = {
  "/marketplace": "layout.marketplaceOps",
  "/": "layout.dashboard",
  "/users": "layout.users",
  "/teams": "layout.teams",
  "/orders": "layout.ordersLedger",
  "/adjustments": "layout.adjustments",
  "/finance": "layout.finance",
  "/projects": "layout.explainerProjects",
  "/drama-projects": "layout.dramaProjects",
  "/drama-assets": "layout.assetLibrary",
  "/drama-episodes": "layout.episodes",
  "/drama-fragments": "layout.shots",
  "/works": "layout.workReview",
  "/templates": "layout.templates",
  "/settings": "layout.systemSettings",
  "/queues": "layout.taskCenter",
};

/** 按路由取页面标题的 key（详情页按前缀匹配） */
function resolveTitleKey(pathname: string): string {
  if (pathname.startsWith("/teams/")) return "layout.teamDetails";
  if (pathname.startsWith("/drama-projects/")) return "layout.dramaProjectDetails";
  if (pathname.startsWith("/drama-assets/")) return "layout.assetDetails";
  if (pathname.startsWith("/drama-episodes/")) return "layout.episodeDetails";
  if (pathname.startsWith("/drama-fragments/")) return "layout.shotDetails";
  return titleKeys[pathname] ?? "layout.adminConsole";
}

/** 统一运营工作台：桌面折叠导航、移动抽屉与可搜索入口。 */
export function AdminLayout() {
  const { t, locale, setLocale } = useI18n();
  const marketplaceEnabled = useMarketplaceEnabled();
  const visibleNavGroups: TranslatedNavGroup[] = navGroups.map((group) => {
    const items = group.id === "business" && marketplaceEnabled
      ? [...group.items, { to: "/marketplace", labelKey: "layout.marketplaceOps", icon: FileVideo } satisfies NavItem]
      : group.items;
    return { id: group.id, label: t(group.labelKey), items: items.map(({ labelKey, ...item }) => ({ ...item, label: t(labelKey) })) };
  });
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCachedUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 800px)").matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerOpen = isMobile && mobileOpen;
  const title = t(resolveTitleKey(location.pathname));
  const initial = (user?.nickname || user?.email || "A").slice(0, 1).toUpperCase();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    function onChange(event: MediaQueryListEvent) {
      setIsMobile(event.matches);
      if (!event.matches) setMobileOpen(false);
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (!mobileDrawerOpen) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const navigationToggle = navigationToggleRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarCloseRef.current?.focus({ preventScroll: true });

    function focusableItems() {
      return Array.from(sidebar!.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    }
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusableItems();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !sidebar!.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar!.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    function keepFocusInside(event: FocusEvent) {
      if (event.target instanceof Node && !sidebar!.contains(event.target)) {
        sidebarCloseRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", trapFocus, true);
    document.addEventListener("focusin", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", trapFocus, true);
      document.removeEventListener("focusin", keepFocusInside);
      document.body.style.overflow = previousOverflow;
      if (sidebar.contains(document.activeElement) || document.activeElement === document.body) {
        const restoreTarget = previouslyFocused?.isConnected ? previouslyFocused : navigationToggle;
        restoreTarget?.focus({ preventScroll: true });
      }
    };
  }, [mobileDrawerOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMobileOpen(false);
        setSearchOpen((value) => !value);
      }
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleLogout() { clearAuth(); navigate("/login"); }
  function toggleNavigation() {
    if (isMobile) setMobileOpen((value) => !value);
    else setCollapsed((value) => !value);
  }

  return (
    <div className={cn("admin-app", collapsed && "is-collapsed", mobileDrawerOpen && "is-mobile-open")}>
      <a className="admin-skip-link" href="#admin-main-content">{t("layout.skipToContent")}</a>
      {mobileDrawerOpen && <button type="button" className="admin-sidebar-scrim" tabIndex={-1} aria-label={t("layout.closeNav")} onClick={() => setMobileOpen(false)} />}
      <aside ref={sidebarRef} className="admin-sidebar" id="admin-sidebar" aria-label={t("layout.adminNav")}
        role={mobileDrawerOpen ? "dialog" : undefined} aria-modal={mobileDrawerOpen ? true : undefined}
        aria-hidden={isMobile && !mobileOpen ? true : undefined} inert={isMobile && !mobileOpen}>
        <div className="admin-brand">
          <div className="admin-brand-mark"><Aperture size={23} strokeWidth={1.7} /></div>
          <div className="admin-brand-copy"><div className="admin-brand-name">PRINTFILM<span>®</span></div><div className="admin-brand-sub">{t("layout.consoleSubtitle")}</div></div>
          <button ref={sidebarCloseRef} type="button" className="admin-icon-btn admin-sidebar-close" aria-label={t("layout.closeNav")} onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <nav className="admin-nav" aria-label={t("layout.mainNav")}>
          {visibleNavGroups.map((group) => (
            <div key={group.id} className="admin-nav-group">
              <div className="admin-nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end ?? !item.matchPrefix}
                  className={({ isActive }) => cn("admin-nav-item", (isActive || (item.matchPrefix && location.pathname.startsWith(`${item.to}/`))) && "is-active")}
                  title={item.label} onClick={() => setMobileOpen(false)}>
                  <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                  <span className="admin-nav-label">{item.label}</span><ChevronRight className="admin-nav-arrow" size={14} />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footnote"><span />PRINTFILM OPERATIONS</div>
        <div className="admin-user-card">
          <div className="admin-avatar">{initial}</div>
          <div className="admin-user-copy"><strong>{user?.nickname || t("layout.adminFallbackName")}</strong><span title={user?.email}>{user?.email}</span></div>
          <button type="button" className="admin-icon-btn admin-logout" onClick={handleLogout} title={t("layout.signOut")} aria-label={t("layout.signOut")}><LogOut size={16} /></button>
        </div>
      </aside>
      <div className="admin-main" inert={mobileDrawerOpen}>
        <header className="admin-topbar">
          <div className="admin-topbar-leading">
            <button ref={navigationToggleRef} type="button" className="admin-icon-btn" onClick={toggleNavigation}
              aria-label={t(isMobile ? (mobileOpen ? "layout.closeNav" : "layout.expandNav") : (collapsed ? "layout.expandNav" : "layout.collapseNav"))}
              aria-controls="admin-sidebar" aria-expanded={isMobile ? mobileOpen : !collapsed}>
              <PanelLeftClose size={19} />
            </button>
            <div className="admin-topbar-breadcrumb"><span>{t("layout.dashboard")}</span><ChevronRight size={13} /><strong>{title}</strong></div>
          </div>
          <div className="admin-topbar-actions">
            <button type="button" className="admin-command-trigger" aria-label={t("layout.searchFeatures")} aria-keyshortcuts="Control+K Meta+K" onClick={() => setSearchOpen(true)}><Search size={15} /><span>{t("layout.searchShort")}</span><kbd>Ctrl K</kbd></button>
            <a className="admin-site-link" href={import.meta.env.DEV ? "http://127.0.0.1:5173" : "/"} target="_blank" rel="noreferrer">{t("layout.userSite")}<ArrowUpRight size={14} /></a>
            <button type="button" className="admin-icon-btn admin-fullscreen" title={t("layout.toggleFullscreen")} aria-label={t("layout.toggleFullscreen")} onClick={() => {
              if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
              else void document.exitFullscreen().catch(() => undefined);
            }}><Maximize2 size={17} /></button>
            <div className="admin-lang-switch" role="group" aria-label={t("lang.label")}>
              {LOCALES.map((code) => (
                <button key={code} type="button" aria-pressed={locale === code}
                  className={cn("admin-lang-option", locale === code && "is-active")} onClick={() => setLocale(code)}>
                  {t(`lang.${code}`)}
                </button>
              ))}
            </div>
            <div className="admin-topbar-avatar" title={user?.email}>{initial}</div>
          </div>
        </header>
        <main className="admin-content" id="admin-main-content" tabIndex={-1}><Outlet /></main>
      </div>
      <AdminNavigationSearch open={searchOpen} onOpenChange={setSearchOpen} groups={visibleNavGroups} />
    </div>
  );
}

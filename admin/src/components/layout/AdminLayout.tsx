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
import { AdminNavigationSearch } from "./AdminNavigationSearch";

type NavItem = {

  to: string;

  label: string;

  icon: typeof LayoutDashboard;

  end?: boolean;

  matchPrefix?: boolean;

};

type NavGroup = {

  label: string;

  items: NavItem[];

};

const navGroups: NavGroup[] = [

  {

    label: "Tổng quan",

    items: [{ to: "/", label: "Bảng điều khiển", icon: LayoutDashboard, end: true }],

  },

  {

    label: "Nghiệp vụ",

    items: [

      { to: "/users", label: "Quản lý người dùng", icon: Users },

      { to: "/teams", label: "Quản lý nhóm", icon: Users, matchPrefix: true },

      { to: "/orders", label: "Giao dịch đơn hàng", icon: Receipt },

      { to: "/adjustments", label: "Điều chỉnh thủ công", icon: Scale },

      { to: "/finance", label: "Danh sách tài chính", icon: Wallet },

      { to: "/projects", label: "Dự án khoa học", icon: Clapperboard },

      { to: "/works", label: "Duyệt tác phẩm", icon: FileVideo },

    ],

  },

  {

    label: "Phim truyện",

    items: [

      { to: "/drama-projects", label: "Dự án phim truyện", icon: Film, matchPrefix: true },

      { to: "/drama-assets", label: "Thư viện tài sản", icon: Image, matchPrefix: true },

      { to: "/drama-episodes", label: "Quản lý tập", icon: ListVideo, matchPrefix: true },

      { to: "/drama-fragments", label: "Quản lý phân cảnh", icon: Layers, matchPrefix: true },

    ],

  },

  {

    label: "Tài nguyên",

    items: [

      { to: "/templates", label: "Quản lý mẫu", icon: Shapes },

      { to: "/queues", label: "Trung tâm tác vụ", icon: Layers },

    ],

  },

  {

    label: "Hệ thống",

    items: [{ to: "/settings", label: "Cài đặt hệ thống", icon: Settings }],

  },

];

const titles: Record<string, string> = {
  "/marketplace": "Vận hành nền tảng tài sản số",

  "/": "Bảng điều khiển",

  "/users": "Quản lý người dùng",

  "/teams": "Quản lý nhóm",

  "/orders": "Giao dịch đơn hàng",

  "/adjustments": "Điều chỉnh thủ công",

  "/finance": "Danh sách tài chính",

  "/projects": "Dự án khoa học",

  "/drama-projects": "Dự án phim truyện",

  "/drama-assets": "Thư viện tài sản",

  "/drama-episodes": "Quản lý tập",

  "/drama-fragments": "Quản lý phân cảnh",

  "/works": "Duyệt tác phẩm",

  "/templates": "Quản lý mẫu",

  "/settings": "Cài đặt hệ thống",

  "/queues": "Trung tâm tác vụ",

};

function resolveTitle(pathname: string): string {

  if (pathname.startsWith("/teams/")) return "Chi tiết nhóm";

  if (pathname.startsWith("/drama-projects/")) return "Chi tiết dự án phim truyện";

  if (pathname.startsWith("/drama-assets/")) return "Chi tiết tài sản";

  if (pathname.startsWith("/drama-episodes/")) return "Chi tiết tập";

  if (pathname.startsWith("/drama-fragments/")) return "Chi tiết phân cảnh";

  return titles[pathname] ?? "Quản trị";

}

/** 统一运营工作台：桌面折叠导航、移动抽屉与可搜索入口。 */
export function AdminLayout() {
  const marketplaceEnabled = useMarketplaceEnabled();
  const visibleNavGroups = navGroups.map((group) => group.label === "Nghiệp vụ" && marketplaceEnabled
    ? { ...group, items: [...group.items, { to: "/marketplace", label: "Vận hành nền tảng tài sản số", icon: FileVideo } satisfies NavItem] }
    : group);
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
  const title = resolveTitle(location.pathname);
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
      <a className="admin-skip-link" href="#admin-main-content">Chuyển đến nội dung trang</a>
      {mobileDrawerOpen && <button type="button" className="admin-sidebar-scrim" tabIndex={-1} aria-label="Đóng điều hướng" onClick={() => setMobileOpen(false)} />}
      <aside ref={sidebarRef} className="admin-sidebar" id="admin-sidebar" aria-label="Điều hướng quản trị"
        role={mobileDrawerOpen ? "dialog" : undefined} aria-modal={mobileDrawerOpen ? true : undefined}
        aria-hidden={isMobile && !mobileOpen ? true : undefined} inert={isMobile && !mobileOpen}>
        <div className="admin-brand">
          <div className="admin-brand-mark"><Aperture size={23} strokeWidth={1.7} /></div>
          <div className="admin-brand-copy"><div className="admin-brand-name">PRINTFILM<span>®</span></div><div className="admin-brand-sub">Bảng điều khiển vận hành</div></div>
          <button ref={sidebarCloseRef} type="button" className="admin-icon-btn admin-sidebar-close" aria-label="Đóng điều hướng" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <nav className="admin-nav" aria-label="Điều hướng chính">
          {visibleNavGroups.map((group) => (
            <div key={group.label} className="admin-nav-group">
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
          <div className="admin-user-copy"><strong>{user?.nickname || "Quản trị viên"}</strong><span title={user?.email}>{user?.email}</span></div>
          <button type="button" className="admin-icon-btn admin-logout" onClick={handleLogout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={16} /></button>
        </div>
      </aside>
      <div className="admin-main" inert={mobileDrawerOpen}>
        <header className="admin-topbar">
          <div className="admin-topbar-leading">
            <button ref={navigationToggleRef} type="button" className="admin-icon-btn" onClick={toggleNavigation}
              aria-label={isMobile ? (mobileOpen ? "Đóng điều hướng" : "Mở rộng điều hướng") : (collapsed ? "Mở rộng điều hướng" : "Thu gọn điều hướng")}
              aria-controls="admin-sidebar" aria-expanded={isMobile ? mobileOpen : !collapsed}>
              <PanelLeftClose size={19} />
            </button>
            <div className="admin-topbar-breadcrumb"><span>Bảng điều khiển</span><ChevronRight size={13} /><strong>{title}</strong></div>
          </div>
          <div className="admin-topbar-actions">
            <button type="button" className="admin-command-trigger" aria-label="Tìm chức năng quản trị" aria-keyshortcuts="Control+K Meta+K" onClick={() => setSearchOpen(true)}><Search size={15} /><span>Tìm chức năng…</span><kbd>Ctrl K</kbd></button>
            <a className="admin-site-link" href={import.meta.env.DEV ? "http://127.0.0.1:5173" : "/"} target="_blank" rel="noreferrer">Trang người dùng<ArrowUpRight size={14} /></a>
            <button type="button" className="admin-icon-btn admin-fullscreen" title="Bật/tắt toàn màn hình" aria-label="Bật/tắt toàn màn hình" onClick={() => {
              if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
              else void document.exitFullscreen().catch(() => undefined);
            }}><Maximize2 size={17} /></button>
            <div className="admin-topbar-avatar" title={user?.email}>{initial}</div>
          </div>
        </header>
        <main className="admin-content" id="admin-main-content" tabIndex={-1}><Outlet /></main>
      </div>
      <AdminNavigationSearch open={searchOpen} onOpenChange={setSearchOpen} groups={visibleNavGroups} />
    </div>
  );
}

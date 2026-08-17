import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Clapperboard,
  FileVideo,
  Film,
  Layers,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Menu,
  Receipt,
  Shapes,
  Users,
} from "lucide-react";
import { clearAuth, getCachedUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard, end: true },
  { to: "/users", label: "用户管理", icon: Users },
  { to: "/orders", label: "订单流水", icon: Receipt },
  { to: "/projects", label: "项目管理", icon: Clapperboard },
  { to: "/drama-projects", label: "漫剧项目", icon: Film },
  { to: "/works", label: "作品审核", icon: FileVideo },
  { to: "/templates", label: "模板管理", icon: Shapes },
  { to: "/queues", label: "队列任务", icon: Layers },
];

const titles: Record<string, string> = {
  "/": "仪表盘",
  "/users": "用户管理",
  "/orders": "订单流水",
  "/projects": "项目管理",
  "/drama-projects": "漫剧项目",
  "/works": "作品审核",
  "/templates": "模板管理",
  "/queues": "队列任务",
};

// Admin shell: sidebar + top bar matching ops console design
export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCachedUser();
  /*
   * collapsed sidebar collapsed state
   */
  const [collapsed, setCollapsed] = useState(false);

  // Logout and return to login
  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  const title = titles[location.pathname] ?? "管理后台";
  const initial = (user?.nickname || user?.email || "A").slice(0, 1).toUpperCase();

  return (
    <div className={cn("admin-app", collapsed && "is-collapsed")}>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">PF</div>
          {!collapsed && (
            <div>
              <div className="admin-brand-name">PRINTFILM</div>
              <div className="admin-brand-sub">管理后台</div>
            </div>
          )}
        </div>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn("admin-nav-item", isActive && "is-active")}
              title={item.label}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="admin-user-card">
          <div className="admin-avatar">{initial}</div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-[#303133]">{user?.email}</div>
              <div className="text-xs text-[#909399]">超级管理员</div>
            </div>
          )}
          <button type="button" className="admin-icon-btn" onClick={handleLogout} title="退出登录">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => setCollapsed((v) => !v)}
              aria-label="折叠侧栏"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="text-base font-semibold text-[#303133]">{title}</h1>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="admin-icon-btn" title="通知">
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="admin-icon-btn"
              title="全屏"
              onClick={() => {
                if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
                else void document.exitFullscreen();
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

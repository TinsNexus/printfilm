import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Clapperboard,
  FileVideo,
  LayoutDashboard,
  LogOut,
  Receipt,
  Shapes,
  Users,
} from "lucide-react";
import { clearAuth, getCachedUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard, end: true },
  { to: "/users", label: "用户管理", icon: Users },
  { to: "/orders", label: "订单流水", icon: Receipt },
  { to: "/projects", label: "项目管理", icon: Clapperboard },
  { to: "/works", label: "作品审核", icon: FileVideo },
  { to: "/templates", label: "模板管理", icon: Shapes },
];

// Admin shell with sidebar navigation
export function AdminLayout() {
  const navigate = useNavigate();
  const user = getCachedUser();

  // Logout and return to login
  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-56 flex-col border-r bg-background">
        <div className="border-b px-4 py-5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PRINTFILM</div>
          <div className="text-lg font-semibold">管理后台</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 truncate px-1 text-xs text-muted-foreground">{user?.email}</div>
          <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

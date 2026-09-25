import { useState } from "react";

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import {

  Bell,

  Clapperboard,

  FileVideo,

  Film,

  Image,

  Layers,

  LayoutDashboard,

  ListVideo,

  LogOut,

  Maximize2,

  Menu,

  Receipt,

  Settings,

  Shapes,

  Users,

  Wallet,

} from "lucide-react";

import { clearAuth, getCachedUser } from "@/lib/auth";

import { cn } from "@/lib/utils";
import { LOCALES, useI18n } from "@/i18n";
import { tr } from "@/i18n/translate";



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

    get label() { return tr("layout.overview") },

    items: [{ to: "/", get label() { return tr("layout.dashboard") }, icon: LayoutDashboard, end: true }],

  },

  {

    get label() { return tr("layout.business") },

    items: [

      { to: "/users", get label() { return tr("layout.users") }, icon: Users },

      { to: "/orders", get label() { return tr("layout.ordersLedger") }, icon: Receipt },
      { to: "/finance", get label() { return tr("layout.finance") }, icon: Wallet },

      { to: "/projects", get label() { return tr("layout.explainerProjects") }, icon: Clapperboard },

      { to: "/works", get label() { return tr("layout.workReview") }, icon: FileVideo },

    ],

  },

  {

    get label() { return tr("layout.drama") },

    items: [

      { to: "/drama-projects", get label() { return tr("layout.dramaProjects") }, icon: Film, matchPrefix: true },

      { to: "/drama-assets", get label() { return tr("layout.assetLibrary") }, icon: Image, matchPrefix: true },

      { to: "/drama-episodes", get label() { return tr("layout.episodes") }, icon: ListVideo, matchPrefix: true },

      { to: "/drama-fragments", get label() { return tr("layout.shots") }, icon: Layers, matchPrefix: true },

    ],

  },

  {

    get label() { return tr("layout.resources") },

    items: [

      { to: "/templates", get label() { return tr("layout.templates") }, icon: Shapes },

      { to: "/queues", get label() { return tr("layout.taskCenter") }, icon: Layers },

    ],

  },

  {

    get label() { return tr("layout.system") },

    items: [{ to: "/settings", get label() { return tr("layout.systemSettings") }, icon: Settings }],

  },

];



const titles: Record<string, string> = {

  get "/"() { return tr("layout.dashboard") },

  get "/users"() { return tr("layout.users") },

  get "/orders"() { return tr("layout.ordersLedger") },
  get "/finance"() { return tr("layout.finance") },

  get "/projects"() { return tr("layout.explainerProjects") },

  get "/drama-projects"() { return tr("layout.dramaProjects") },

  get "/drama-assets"() { return tr("layout.assetLibrary") },

  get "/drama-episodes"() { return tr("layout.episodes") },

  get "/drama-fragments"() { return tr("layout.shots") },

  get "/works"() { return tr("layout.workReview") },

  get "/templates"() { return tr("layout.templates") },

  get "/settings"() { return tr("layout.systemSettings") },

  get "/queues"() { return tr("layout.taskCenter") },

};



function resolveTitle(pathname: string): string {

  if (pathname.startsWith("/drama-projects/")) return tr("layout.dramaProjectDetails");

  if (pathname.startsWith("/drama-assets/")) return tr("layout.assetDetails");

  if (pathname.startsWith("/drama-episodes/")) return tr("layout.episodeDetails");

  if (pathname.startsWith("/drama-fragments/")) return tr("layout.shotDetails");

  return titles[pathname] ?? tr("layout.adminConsole");

}



// Admin shell: dark sidebar + glass top bar

export function AdminLayout() {
  const { t: tx, locale, setLocale } = useI18n();

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



  const title = resolveTitle(location.pathname);

  const initial = (user?.nickname || user?.email || "A").slice(0, 1).toUpperCase();



  return (

    <div className={cn("admin-app", collapsed && "is-collapsed")}>

      <aside className="admin-sidebar">

        <div className="admin-brand">

          <div className="admin-brand-mark">PF</div>

          {!collapsed && (

            <div>

              <div className="admin-brand-name">PRINTFILM</div>

              <div className="admin-brand-sub">{tx("layout.adminConsole")}</div>

            </div>

          )}

        </div>

        <nav className="admin-nav">

          {navGroups.map((group) => (

            <div key={group.label} className="admin-nav-group">

              {!collapsed ? <div className="admin-nav-group-label">{group.label}</div> : null}

              {group.items.map((item) => (

                <NavLink

                  key={item.to}

                  to={item.to}

                  end={item.end ?? !item.matchPrefix}

                  className={({ isActive }) =>

                    cn(

                      "admin-nav-item",

                      (isActive || (item.matchPrefix && location.pathname.startsWith(`${item.to}/`))) &&

                        "is-active",

                    )

                  }

                  title={item.label}

                >

                  <item.icon className="h-[18px] w-[18px] shrink-0" />

                  {!collapsed && <span>{item.label}</span>}

                </NavLink>

              ))}

            </div>

          ))}

        </nav>

        <div className="admin-user-card">

          <div className="admin-avatar">{initial}</div>

          {!collapsed && (

            <div className="min-w-0 flex-1">

              <div className="truncate text-[13px] font-medium text-[#e8f0eb]">{user?.email}</div>

              <div className="text-xs text-[rgba(240,245,242,0.45)]">{tx("layout.superAdmin")}</div>

            </div>

          )}

          <button type="button" className="admin-icon-btn !text-[rgba(240,245,242,0.55)] hover:!text-[#e8f0eb]" onClick={handleLogout} title={tx("layout.signOut")}>

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

              aria-label={tx("layout.collapseSidebar")}

            >

              <Menu className="h-4 w-4" />

            </button>

            <div>

              <div className="admin-topbar-title">{title}</div>

              <div className="admin-topbar-crumb">{tx("layout.printfilmOperations")}</div>

            </div>

          </div>

          <div className="flex items-center gap-1">

            <div className="mr-1 flex items-center gap-0.5 rounded-md border border-black/10 p-0.5" role="group" aria-label={tx("lang.label")}>
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={locale === code}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                    locale === code ? "bg-[#1a2b22] text-white" : "text-slate-500 hover:text-slate-800",
                  )}
                  onClick={() => setLocale(code)}
                >
                  {tx(`lang.${code}`)}
                </button>
              ))}
            </div>
            <button type="button" className="admin-icon-btn" title={tx("layout.notifications")}>

              <Bell className="h-4 w-4" />

            </button>

            <button

              type="button"

              className="admin-icon-btn"

              title={tx("layout.fullscreen")}

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



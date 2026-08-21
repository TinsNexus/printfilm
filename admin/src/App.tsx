import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { getCachedUser, getToken, isAdminUser } from "@/lib/auth";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { DramaProjectsPage } from "@/pages/DramaProjectsPage";
import { QueuesPage } from "@/pages/QueuesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import { UsersPage } from "@/pages/UsersPage";
import { WorksPage } from "@/pages/WorksPage";

// Guard: require JWT + admin role
function RequireAdmin() {
  const token = getToken();
  const user = getCachedUser();
  if (!token || !isAdminUser(user)) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

// Admin app routes
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="drama-projects" element={<DramaProjectsPage />} />
          <Route path="works" element={<WorksPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="queues" element={<QueuesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

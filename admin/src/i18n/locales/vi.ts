import { viAdminUsers } from "./vi/adminUsers";
import { viAdminProjects } from "./vi/adminProjects";
import { viAdminQueues } from "./vi/adminQueues";
import { viAdminPaymentSettings } from "./vi/adminPaymentSettings";
import { viAdminDashboard } from "./vi/adminDashboard";
import { viAdminTaskDetail } from "./vi/adminTaskDetail";
import { viAdminOrders } from "./vi/adminOrders";
import { viAdminLayout } from "./vi/adminLayout";
import { viAdminStatus } from "./vi/adminStatus";
import { viShell } from "./vi/shell";

export const vi = {
  ...viShell,
  ...viAdminUsers,
  ...viAdminProjects,
  ...viAdminQueues,
  ...viAdminPaymentSettings,
  ...viAdminDashboard,
  ...viAdminTaskDetail,
  ...viAdminOrders,
  ...viAdminLayout,
  ...viAdminStatus,
};

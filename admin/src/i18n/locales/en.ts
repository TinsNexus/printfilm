import { enAdminUsers } from "./en/adminUsers";
import { enAdminProjects } from "./en/adminProjects";
import { enAdminQueues } from "./en/adminQueues";
import { enAdminPaymentSettings } from "./en/adminPaymentSettings";
import { enAdminDashboard } from "./en/adminDashboard";
import { enAdminTaskDetail } from "./en/adminTaskDetail";
import { enAdminOrders } from "./en/adminOrders";
import { enAdminLayout } from "./en/adminLayout";
import { enAdminStatus } from "./en/adminStatus";
import { enShell } from "./en/shell";

export const en = {
  ...enShell,
  ...enAdminUsers,
  ...enAdminProjects,
  ...enAdminQueues,
  ...enAdminPaymentSettings,
  ...enAdminDashboard,
  ...enAdminTaskDetail,
  ...enAdminOrders,
  ...enAdminLayout,
  ...enAdminStatus,
};

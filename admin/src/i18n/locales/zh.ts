import { zhAdminTaskDetail } from "./zh/adminTaskDetail";
import { zhAdminOrders } from "./zh/adminOrders";
import { zhAdminLayout } from "./zh/adminLayout";
import { zhAdminStatus } from "./zh/adminStatus";
import { zhShell } from "./zh/shell";

export const zh = {
  ...zhShell,
  ...zhAdminTaskDetail,
  ...zhAdminOrders,
  ...zhAdminLayout,
  ...zhAdminStatus,
};

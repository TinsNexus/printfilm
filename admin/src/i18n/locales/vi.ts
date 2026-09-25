import { viAdminTaskDetail } from "./vi/adminTaskDetail";
import { viAdminOrders } from "./vi/adminOrders";
import { viAdminLayout } from "./vi/adminLayout";
import { viAdminStatus } from "./vi/adminStatus";
import { viShell } from "./vi/shell";

export const vi = {
  ...viShell,
  ...viAdminTaskDetail,
  ...viAdminOrders,
  ...viAdminLayout,
  ...viAdminStatus,
};

import { enAdminTaskDetail } from "./en/adminTaskDetail";
import { enAdminOrders } from "./en/adminOrders";
import { enAdminLayout } from "./en/adminLayout";
import { enAdminStatus } from "./en/adminStatus";
import { enShell } from "./en/shell";

export const en = {
  ...enShell,
  ...enAdminTaskDetail,
  ...enAdminOrders,
  ...enAdminLayout,
  ...enAdminStatus,
};

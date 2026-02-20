import { rotateToken } from "../../config";
import { removeAllNotificationSubscriptions } from "../../notifications/service";

export const runTokenRotateCommand = () => {
  const next = rotateToken();
  removeAllNotificationSubscriptions();
  console.log(next.token);
};

import { rotateToken } from "../../config";

export const runTokenRotateCommand = () => {
  const next = rotateToken();
  console.log(next.token);
};

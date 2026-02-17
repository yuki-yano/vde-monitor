import { useInterval } from "@mantine/hooks";
import { useEffect, useState } from "react";

export const useNowMs = (intervalMs = 60_000) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { start, stop } = useInterval(() => setNowMs(Date.now()), intervalMs);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return nowMs;
};

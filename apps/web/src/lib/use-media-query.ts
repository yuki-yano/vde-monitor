import { useMediaQuery as useMantineMediaQuery } from "@mantine/hooks";

export const useMediaQuery = (query: string) => {
  return useMantineMediaQuery(query, false, { getInitialValueInEffect: false });
};

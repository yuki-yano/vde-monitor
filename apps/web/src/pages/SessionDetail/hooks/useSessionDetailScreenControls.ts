import type {
  AllowedKey,
  CommandResponse,
  HighlightCorrectionConfig,
  ImageAttachment,
  RawItem,
  ScreenResponse,
} from "@vde-monitor/shared";

import type { Theme } from "@/lib/theme";

import { useSessionControls } from "./useSessionControls";
import { useSessionScreen } from "./useSessionScreen";

type UseSessionDetailScreenControlsArgs = {
  paneId: string;
  connected: boolean;
  connectionIssue: string | null;
  resolvedTheme: Theme;
  sessionAgent: string | null;
  highlightCorrections: HighlightCorrectionConfig;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  sendText: (
    paneId: string,
    text: string,
    enter?: boolean,
    requestId?: string,
  ) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  killPane: (paneId: string) => Promise<CommandResponse>;
  killWindow: (paneId: string) => Promise<CommandResponse>;
  uploadImageAttachment?: (paneId: string, file: File) => Promise<ImageAttachment>;
  apiBaseUrl?: string | null;
  token?: string | null;
};

export const useSessionDetailScreenControls = ({
  paneId,
  connected,
  connectionIssue,
  resolvedTheme,
  sessionAgent,
  highlightCorrections,
  requestScreen,
  sendText,
  sendKeys,
  sendRaw,
  killPane,
  killWindow,
  uploadImageAttachment,
  apiBaseUrl,
  token,
}: UseSessionDetailScreenControlsArgs) => {
  const screen = useSessionScreen({
    paneId,
    connected,
    connectionIssue,
    resolvedTheme,
    sessionAgent,
    highlightCorrections,
    requestScreen,
    apiBaseUrl,
    token,
  });

  const controls = useSessionControls({
    paneId,
    mode: screen.mode,
    sendText,
    sendKeys,
    sendRaw,
    killPane,
    killWindow,
    uploadImageAttachment,
    setScreenError: screen.setScreenError,
    scrollToBottom: screen.scrollToBottom,
  });

  const handleRefreshScreen = () => {
    void screen.refreshScreen();
  };

  return {
    screen,
    controls,
    handleRefreshScreen,
  };
};

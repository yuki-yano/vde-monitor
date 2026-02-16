import type {
  AllowedKey,
  CommandResponse,
  ImageAttachment,
  RawItem,
  ScreenResponse,
} from "@vde-monitor/shared";

import { useSessionControls } from "./useSessionControls";
import { useSessionScreen } from "./useSessionScreen";

type UseSessionDetailScreenControlsArgs = {
  paneId: string;
  connected: boolean;
  connectionIssue: string | null;
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
};

export const useSessionDetailScreenControls = ({
  paneId,
  connected,
  connectionIssue,
  requestScreen,
  sendText,
  sendKeys,
  sendRaw,
  killPane,
  killWindow,
  uploadImageAttachment,
}: UseSessionDetailScreenControlsArgs) => {
  const screen = useSessionScreen({
    paneId,
    connected,
    connectionIssue,
    requestScreen,
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

import type {
  AllowedKey,
  CommandResponse,
  ImageAttachment,
  RawItem,
  SessionSummary,
} from "@vde-monitor/shared";
import { LayoutGrid, Loader2 } from "lucide-react";

import { EmptyCard } from "@/components/ui";
import { PaneGridLayout } from "@/features/shared-session-ui/components/PaneGridLayout";
import { cn } from "@/lib/cn";
import type { ChatGridLayout } from "@/pages/ChatGrid/model/chat-grid-layout";

import { ChatGridTile } from "./ChatGridTile";

type ChatGridBoardProps = {
  sessions: SessionSummary[];
  isRestoringSelection: boolean;
  layout: ChatGridLayout;
  nowMs: number;
  connected: boolean;
  screenByPane: Record<string, string[]>;
  screenLoadingByPane: Record<string, boolean>;
  screenErrorByPane: Record<string, string | null>;
  onTouchSession: (paneId: string) => Promise<void> | void;
  sendText: (
    paneId: string,
    text: string,
    enter?: boolean,
    requestId?: string,
  ) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  uploadImageAttachment?: (paneId: string, file: File) => Promise<ImageAttachment>;
};

const resolveLayoutClassName = (layout: ChatGridLayout) => {
  if (layout.columns === 2 && layout.rows === 1) {
    return "xl:grid-cols-2 md:grid-rows-1";
  }
  if (layout.columns === 3 && layout.rows === 1) {
    return "xl:grid-cols-3 md:grid-rows-1";
  }
  if (layout.columns === 2 && layout.rows === 2) {
    return "xl:grid-cols-2 md:grid-rows-2";
  }
  return "xl:grid-cols-3 md:grid-rows-2";
};

export const ChatGridBoard = ({
  sessions,
  isRestoringSelection,
  layout,
  nowMs,
  connected,
  screenByPane,
  screenLoadingByPane,
  screenErrorByPane,
  onTouchSession,
  sendText,
  sendKeys,
  sendRaw,
  uploadImageAttachment,
}: ChatGridBoardProps) => {
  if (sessions.length === 0) {
    if (isRestoringSelection) {
      return (
        <EmptyCard
          icon={<Loader2 className="text-latte-overlay1 h-8 w-8 animate-spin" />}
          title="Loading Grid..."
          description="Restoring selected panes from URL."
          className="py-12 sm:py-16"
        />
      );
    }
    return (
      <EmptyCard
        icon={<LayoutGrid className="text-latte-overlay1 h-8 w-8" />}
        title="No Grid Applied"
        description="Pick candidate panes and apply them to start monitoring chat panes in grid mode."
        className="py-12 sm:py-16"
      />
    );
  }

  return (
    <PaneGridLayout
      responsivePreset="chat-grid"
      gap="normal"
      className={cn(
        "min-h-[calc(100dvh-250px)] auto-rows-fr grid-cols-1 items-stretch md:grid-cols-2",
        resolveLayoutClassName(layout),
      )}
    >
      {sessions.map((session) => (
        <div key={session.paneId} className="min-h-0">
          <ChatGridTile
            session={session}
            nowMs={nowMs}
            connected={connected}
            screenLines={screenByPane[session.paneId] ?? []}
            screenLoading={Boolean(screenLoadingByPane[session.paneId])}
            screenError={screenErrorByPane[session.paneId] ?? null}
            onTouchSession={onTouchSession}
            sendText={sendText}
            sendKeys={sendKeys}
            sendRaw={sendRaw}
            uploadImageAttachment={uploadImageAttachment}
          />
        </div>
      ))}
    </PaneGridLayout>
  );
};

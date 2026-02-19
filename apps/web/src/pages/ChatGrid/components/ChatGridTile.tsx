import { Link } from "@tanstack/react-router";
import type {
  AllowedKey,
  CommandResponse,
  ImageAttachment,
  RawItem,
  SessionSummary,
} from "@vde-monitor/shared";
import { defaultDangerKeys } from "@vde-monitor/shared";
import { ArrowRight, Clock, GitBranch, X } from "lucide-react";
import {
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import {
  Badge,
  Callout,
  Card,
  IconButton,
  LastInputPill,
  TagPill,
  TextButton,
} from "@/components/ui";
import { AnsiVirtualizedViewport } from "@/features/shared-session-ui/components/AnsiVirtualizedViewport";
import { PaneTextComposer } from "@/features/shared-session-ui/components/PaneTextComposer";
import { usePaneSendText } from "@/features/shared-session-ui/hooks/usePaneSendText";
import {
  resolveSessionStateLabel,
  resolveSessionStateTone,
} from "@/features/shared-session-ui/model/session-display";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveResultErrorMessage, resolveUnknownErrorMessage } from "@/lib/api-utils";
import {
  agentLabelFor,
  agentToneFor,
  formatBranchLabel,
  formatRelativeTime,
  getLastInputTone,
  isKnownAgent,
} from "@/lib/session-format";
import { mapKeyWithModifiers } from "@/pages/SessionDetail/hooks/sessionControlKeys";
import { useRawInputHandlers } from "@/pages/SessionDetail/hooks/useRawInputHandlers";
import {
  linkifyLogLineFileReferences,
  linkifyLogLineHttpUrls,
} from "@/pages/SessionDetail/log-file-reference";
import {
  buildDefaultSessionTitle,
  isDangerousText,
} from "@/pages/SessionDetail/sessionDetailUtils";

type ChatGridTileProps = {
  session: SessionSummary;
  nowMs: number;
  connected: boolean;
  screenLines: string[];
  screenLoading: boolean;
  screenError: string | null;
  onTouchSession?: (paneId: string) => Promise<void> | void;
  sendText: (
    paneId: string,
    text: string,
    enter?: boolean,
    requestId?: string,
  ) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  updateSessionTitle: (paneId: string, title: string | null) => Promise<void>;
  uploadImageAttachment?: (paneId: string, file: File) => Promise<ImageAttachment>;
};

const confirmDangerousTextSend = (value: string) => {
  if (!isDangerousText(value)) {
    return true;
  }
  return window.confirm("Dangerous command detected. Send anyway?");
};

const confirmDangerousKeySend = (mappedKey: string) => {
  if (!defaultDangerKeys.includes(mappedKey as AllowedKey)) {
    return true;
  }
  return window.confirm("Dangerous key detected. Send anyway?");
};

const insertIntoTextarea = (textarea: HTMLTextAreaElement, insertText: string) => {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const current = textarea.value;
  const next = `${current.slice(0, start)}${insertText}${current.slice(end)}`;
  textarea.value = next;
  const nextCaret = start + insertText.length;
  textarea.selectionStart = nextCaret;
  textarea.selectionEnd = nextCaret;
};

const isWhitespace = (char: string) => /\s/u.test(char);

const buildImagePathInsertText = (textarea: HTMLTextAreaElement, imagePath: string): string => {
  const start = textarea.selectionStart ?? textarea.value.length;
  const previousChar = start > 0 ? (textarea.value[start - 1] ?? "") : "";
  const prefix = start > 0 && !isWhitespace(previousChar) ? "\n" : "";
  return `${prefix}${imagePath}\n`;
};

export const ChatGridTile = ({
  session,
  nowMs,
  connected,
  screenLines,
  screenLoading,
  screenError,
  onTouchSession,
  sendText,
  sendKeys,
  sendRaw,
  updateSessionTitle,
  uploadImageAttachment,
}: ChatGridTileProps) => {
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousAutoEnterRef = useRef<boolean | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [autoEnter, setAutoEnter] = useState(true);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [allowDangerKeys, setAllowDangerKeys] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(session.customTitle ?? "");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const sessionTone = getLastInputTone(session.lastInputAt, nowMs);
  const sessionCustomTitle = session.customTitle ?? null;
  const sessionDefaultTitle = buildDefaultSessionTitle(session);
  const canResetAutoTitle =
    sessionCustomTitle == null && session.title != null && session.title !== sessionDefaultTitle;
  const canResetTitle = Boolean(sessionCustomTitle || canResetAutoTitle);
  const sessionAutoTitle = session.title ?? session.sessionName ?? "";
  const sessionDisplayTitle = sessionCustomTitle ?? sessionAutoTitle;

  useEffect(() => {
    setTitleEditing(false);
    setTitleSaving(false);
    setTitleError(null);
    setTitleDraft(sessionCustomTitle ?? "");
  }, [session.paneId, sessionCustomTitle]);

  useEffect(() => {
    if (titleEditing) return;
    setTitleDraft(sessionCustomTitle ?? "");
  }, [sessionCustomTitle, titleEditing]);
  const displayLines = useMemo(() => {
    if (screenLines.length > 0) {
      return screenLines.map((line) => {
        let linkified = linkifyLogLineFileReferences(line, {
          isLinkableToken: (rawToken) => rawToken.includes("/") || rawToken.includes("\\"),
        });
        if (linkified.includes("http://") || linkified.includes("https://")) {
          linkified = linkifyLogLineHttpUrls(linkified);
        }
        return linkified;
      });
    }
    if (screenLoading) {
      return [];
    }
    return ["No screen data yet."];
  }, [screenLines, screenLoading]);
  const scrollToBottom = useCallback(
    (behavior: "auto" | "smooth" = "smooth") => {
      virtuosoRef.current?.scrollToIndex({
        index: Math.max(displayLines.length - 1, 0),
        behavior,
        align: "end",
      });
    },
    [displayLines.length],
  );

  const {
    send,
    isSending,
    error: sendError,
  } = usePaneSendText({
    paneId: session.paneId,
    mode: "text",
    sendText,
    setScreenError: setComposerError,
    scrollToBottom,
  });

  const {
    handleRawBeforeInput,
    handleRawInput,
    handleRawKeyDown,
    handleRawCompositionStart,
    handleRawCompositionEnd,
  } = useRawInputHandlers({
    paneId: session.paneId,
    rawMode,
    allowDangerKeys,
    ctrlHeld,
    shiftHeld,
    sendRaw,
    setScreenError: setComposerError,
  });

  const handleSendText = useCallback(async () => {
    const value = textInputRef.current?.value ?? "";
    const sent = await send({
      text: value,
      enter: autoEnter,
      skip: rawMode,
      confirm: () => confirmDangerousTextSend(value),
      onSuccess: () => {
        if (textInputRef.current) {
          textInputRef.current.value = "";
        }
        void onTouchSession?.(session.paneId);
      },
    });
    return sent;
  }, [autoEnter, onTouchSession, rawMode, send, session.paneId]);

  const handlePickImage = useCallback(
    async (file: File) => {
      const textarea = textInputRef.current;
      if (!textarea) {
        return;
      }
      if (!uploadImageAttachment) {
        setComposerError(API_ERROR_MESSAGES.uploadImage);
        return;
      }
      try {
        const attachment = await uploadImageAttachment(session.paneId, file);
        insertIntoTextarea(textarea, buildImagePathInsertText(textarea, attachment.path));
        setComposerError(null);
      } catch (error) {
        setComposerError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.uploadImage));
      }
    },
    [session.paneId, uploadImageAttachment],
  );

  const handleToggleRawMode = useCallback(() => {
    setRawMode((prevRawMode) => {
      const nextRawMode = !prevRawMode;
      if (nextRawMode) {
        previousAutoEnterRef.current = autoEnter;
        setAutoEnter(false);
      } else {
        if (previousAutoEnterRef.current != null) {
          setAutoEnter(previousAutoEnterRef.current);
          previousAutoEnterRef.current = null;
        }
        setAllowDangerKeys(false);
      }
      return nextRawMode;
    });
  }, [autoEnter]);

  const handleSendKey = useCallback(
    async (key: string) => {
      const mappedKey = mapKeyWithModifiers(key, ctrlHeld, shiftHeld) as AllowedKey;
      if (rawMode) {
        const rawResult = await sendRaw(
          session.paneId,
          [{ kind: "key", value: mappedKey }],
          allowDangerKeys,
        );
        if (!rawResult.ok) {
          setComposerError(resolveResultErrorMessage(rawResult, API_ERROR_MESSAGES.sendRaw));
          return;
        }
        setComposerError(null);
        return;
      }
      if (!confirmDangerousKeySend(mappedKey)) {
        return;
      }
      const keyResult = await sendKeys(session.paneId, [mappedKey]);
      if (!keyResult.ok) {
        setComposerError(resolveResultErrorMessage(keyResult, API_ERROR_MESSAGES.sendKeys));
        return;
      }
      setComposerError(null);
    },
    [allowDangerKeys, ctrlHeld, rawMode, sendKeys, sendRaw, session.paneId, shiftHeld],
  );

  const openTitleEditor = useCallback(() => {
    setTitleError(null);
    setTitleDraft(sessionCustomTitle ?? "");
    setTitleEditing(true);
  }, [sessionCustomTitle]);

  const closeTitleEditor = useCallback(() => {
    setTitleEditing(false);
    setTitleError(null);
    setTitleDraft(sessionCustomTitle ?? "");
  }, [sessionCustomTitle]);

  const handleTitleDraftChange = useCallback((value: string) => {
    setTitleDraft(value);
    setTitleError(null);
  }, []);

  const handleTitleSave = useCallback(async () => {
    if (titleSaving) return;
    const trimmed = titleDraft.trim();
    if (trimmed.length > 80) {
      setTitleError("Title must be 80 characters or less.");
      return;
    }

    setTitleSaving(true);
    try {
      await updateSessionTitle(session.paneId, trimmed.length > 0 ? trimmed : null);
      setTitleEditing(false);
      setTitleError(null);
    } catch (error) {
      setTitleError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.updateTitle));
    } finally {
      setTitleSaving(false);
    }
  }, [session.paneId, titleDraft, titleSaving, updateSessionTitle]);

  const handleTitleReset = useCallback(async () => {
    if (titleSaving) return;
    const nextTitle = session.customTitle ? null : buildDefaultSessionTitle(session);

    setTitleSaving(true);
    try {
      await updateSessionTitle(session.paneId, nextTitle);
      setTitleEditing(false);
      setTitleDraft(nextTitle ?? "");
      setTitleError(null);
    } catch (error) {
      setTitleError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.updateTitle));
    } finally {
      setTitleSaving(false);
    }
  }, [session, titleSaving, updateSessionTitle]);

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleTitleSave();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeTitleEditor();
      }
    },
    [closeTitleEditor, handleTitleSave],
  );

  const handleTitleBlur = useCallback(() => {
    if (titleSaving) {
      return;
    }
    closeTitleEditor();
  }, [closeTitleEditor, titleSaving]);

  const currentComposerError = composerError ?? sendError;
  const callout =
    currentComposerError != null
      ? { tone: "error" as const, message: currentComposerError }
      : screenError != null
        ? { tone: "warning" as const, message: screenError }
        : !connected
          ? { tone: "warning" as const, message: "Disconnected. Reconnecting..." }
          : null;

  return (
    <Card className="grid h-full min-h-[420px] grid-rows-[auto_minmax(0,1fr)] gap-2.5 p-3 sm:p-3.5">
      <header className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 items-center gap-1">
              {titleEditing ? (
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(event) => {
                    handleTitleDraftChange(event.target.value);
                  }}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleTitleBlur}
                  placeholder={sessionAutoTitle || "Untitled session"}
                  maxLength={80}
                  enterKeyHint="done"
                  disabled={titleSaving}
                  className="border-latte-surface2 text-latte-text focus:border-latte-lavender focus:ring-latte-lavender/30 bg-latte-base/70 shadow-elev-1 w-full min-w-[160px] rounded-2xl border px-2.5 py-1 text-[15px] font-semibold leading-snug outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Custom session title"
                  autoFocus
                />
              ) : (
                <TextButton
                  type="button"
                  onClick={openTitleEditor}
                  variant="title"
                  className="hover:text-latte-lavender mr-1 block min-w-0 max-w-full truncate text-[15px] font-semibold leading-snug transition"
                  aria-label="Edit session title"
                >
                  {sessionDisplayTitle}
                </TextButton>
              )}
              {canResetTitle && !titleEditing ? (
                <IconButton
                  type="button"
                  onClick={() => void handleTitleReset()}
                  disabled={titleSaving}
                  variant="dangerOutline"
                  size="xs"
                  aria-label="Reset session title"
                  title="Reset session title"
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
            </div>
            {titleError ? <p className="text-latte-red text-xs">{titleError}</p> : null}
          </div>
          <div className="flex shrink-0 items-center">
            <Link
              to="/sessions/$paneId"
              params={{ paneId: session.paneId }}
              aria-label="Open detail"
              className="border-latte-surface2 bg-latte-base/80 text-latte-subtext0 hover:border-latte-lavender/60 hover:text-latte-lavender shadow-elev-3 inline-flex h-6 w-6 items-center justify-center rounded-full border transition"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={resolveSessionStateTone(session)} size="sm">
            {resolveSessionStateLabel(session)}
          </Badge>
          {isKnownAgent(session.agent) ? (
            <Badge tone={agentToneFor(session.agent)} size="sm">
              {agentLabelFor(session.agent)}
            </Badge>
          ) : null}
          <LastInputPill
            tone={sessionTone}
            label={<Clock className="h-2.5 w-2.5" />}
            value={formatRelativeTime(session.lastInputAt, nowMs)}
            srLabel="Last input"
            size="xs"
            showDot={false}
          />
        </div>
        <div className="text-latte-subtext0 flex flex-wrap items-center gap-1.5 text-[11px]">
          <TagPill tone="meta" className="inline-flex max-w-[180px] items-center">
            <span className="truncate font-mono">{session.sessionName}</span>
          </TagPill>
          <TagPill tone="meta" className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            <span>{formatBranchLabel(session.branch)}</span>
          </TagPill>
          <TagPill tone="meta">Window {session.windowIndex}</TagPill>
          <TagPill tone="meta">Pane {session.paneId}</TagPill>
        </div>
      </header>

      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
        <div className="flex min-h-0 flex-col gap-2">
          {callout ? (
            <Callout tone={callout.tone} size="xs">
              {callout.message}
            </Callout>
          ) : null}

          <AnsiVirtualizedViewport
            lines={displayLines}
            loading={screenLoading}
            loadingLabel="Loading screen..."
            isAtBottom={isAtBottom}
            onAtBottomChange={setIsAtBottom}
            virtuosoRef={virtuosoRef}
            onScrollToBottom={scrollToBottom}
            className="border-latte-surface2/80 bg-latte-crust/95 shadow-inner-soft relative min-h-[180px] w-full min-w-0 flex-1 rounded-2xl border"
            viewportClassName="h-full w-full min-w-0"
            listClassName="text-latte-text w-max min-w-full px-1.5 py-1 font-mono text-xs sm:px-2 sm:py-1.5"
            lineClassName="min-h-4 whitespace-pre leading-4"
            height="100%"
          />
        </div>

        <PaneTextComposer
          state={{
            interactive: connected,
            isSendingText: isSending,
            textInputRef,
            autoEnter,
            rawMode,
            allowDangerKeys,
            keyPanel: {
              shiftHeld,
              ctrlHeld,
            },
          }}
          actions={{
            onSendText: handleSendText,
            onPickImage: handlePickImage,
            onToggleAutoEnter: () => setAutoEnter((prev) => !prev),
            onToggleRawMode: handleToggleRawMode,
            onToggleAllowDangerKeys: () => setAllowDangerKeys((prev) => !prev),
            keyPanel: {
              onToggleShift: () => setShiftHeld((prev) => !prev),
              onToggleCtrl: () => setCtrlHeld((prev) => !prev),
              onSendKey: (key: string) => {
                void handleSendKey(key);
              },
            },
            onRawBeforeInput: (event: FormEvent<HTMLTextAreaElement>) => {
              handleRawBeforeInput(event);
            },
            onRawInput: (event: FormEvent<HTMLTextAreaElement>) => {
              handleRawInput(event);
            },
            onRawKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
              handleRawKeyDown(event);
            },
            onRawCompositionStart: () => {
              handleRawCompositionStart();
            },
            onRawCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => {
              handleRawCompositionEnd(event);
            },
          }}
        />
      </div>
    </Card>
  );
};

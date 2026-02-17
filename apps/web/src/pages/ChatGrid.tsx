import { Link } from "@tanstack/react-router";

import { DEFAULT_SESSION_LIST_FILTER } from "@/features/shared-session-ui/model/session-list-filters";
import { APP_DISPLAY_NAME } from "@/lib/brand";
import { useMediaQuery } from "@/lib/use-media-query";

import { ChatGridView } from "./ChatGrid/ChatGridView";
import { useChatGridVM } from "./ChatGrid/useChatGridVM";

const ChatGridDesktop = () => {
  const viewModel = useChatGridVM();
  return (
    <>
      <title>{`Chat Grid - ${APP_DISPLAY_NAME}`}</title>
      <ChatGridView {...viewModel} />
    </>
  );
};

export const ChatGridPage = () => {
  const isMobile = useMediaQuery("(max-width: 767px)");
  if (isMobile) {
    return (
      <>
        <title>{APP_DISPLAY_NAME}</title>
        <main className="flex min-h-screen items-center justify-center p-4">
          <div className="border-latte-surface1/70 bg-latte-base/80 max-w-md space-y-3 rounded-2xl border p-5 text-center shadow-sm backdrop-blur">
            <h1 className="font-display text-latte-text text-2xl">Chat Grid is desktop only</h1>
            <p className="text-latte-subtext1 text-sm leading-relaxed">
              Chat Grid is available on larger screens. Please open this page from a desktop
              browser.
            </p>
            <Link
              to="/"
              search={{ filter: DEFAULT_SESSION_LIST_FILTER }}
              className="text-latte-lavender hover:text-latte-blue inline-flex text-sm font-semibold transition"
            >
              Back to Live Sessions
            </Link>
          </div>
        </main>
      </>
    );
  }

  return <ChatGridDesktop />;
};

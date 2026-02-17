import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import App from "./App";
import {
  DEFAULT_SESSION_LIST_FILTER,
  isSessionListFilter,
} from "./features/shared-session-ui/model/session-list-filters";
import { ChatGridPage } from "./pages/ChatGrid";
import {
  normalizeChatGridPaneParam,
  serializeChatGridPaneParam,
} from "./pages/ChatGrid/chatGridSearch";
import { SessionDetailPage } from "./pages/SessionDetail";
import { SessionListPage } from "./pages/SessionList";
import { normalizeSessionListSearchQuery } from "./pages/SessionList/sessionListSearch";

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: SessionListPage,
  validateSearch: (search: Record<string, unknown>) => {
    const filter = isSessionListFilter(search.filter) ? search.filter : DEFAULT_SESSION_LIST_FILTER;
    const q = normalizeSessionListSearchQuery(search.q);
    if (q.length === 0) {
      return { filter };
    }
    return { filter, q };
  },
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$paneId",
  component: SessionDetailPage,
});

const chatGridRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat-grid",
  component: ChatGridPage,
  validateSearch: (search: Record<string, unknown>) => {
    const paneIds = normalizeChatGridPaneParam(search.panes);
    const panes = serializeChatGridPaneParam(paneIds);
    if (!panes) {
      return {};
    }
    return { panes };
  },
});

const routeTree = rootRoute.addChildren([indexRoute, sessionDetailRoute, chatGridRoute]);

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  scrollToTopSelectors: ["#root"],
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

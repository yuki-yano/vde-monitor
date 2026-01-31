import { Route, Routes } from "react-router-dom";

import { SessionDetailPage } from "@/pages/SessionDetail";
import { SessionListPage } from "@/pages/SessionList";
import { SessionProvider } from "@/state/session-context";
import { ThemeProvider } from "@/state/theme-context";

const App = () => {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<SessionListPage />} />
          <Route path="/sessions/:paneId" element={<SessionDetailPage />} />
        </Routes>
      </SessionProvider>
    </ThemeProvider>
  );
};

export default App;

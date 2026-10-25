import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Shell } from "@/components/Shell";
import { Spinner } from "@/components/ui/spinner";
import { AppPage } from "@/pages/AppPage";
import { AppsPage } from "@/pages/AppsPage";
import { KeysPage } from "@/pages/KeysPage";
import { SectionPage } from "@/pages/SectionPage";
import { SignInPage } from "@/pages/SignInPage";
import { UsagePage } from "@/pages/UsagePage";

export default function App() {
  return (
    <>
      <AuthLoading>
        <div className="flex-1 grid place-items-center">
          <Spinner className="size-6 text-primary" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignInPage />
      </Unauthenticated>
      <Authenticated>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/keys" element={<KeysPage />} />
              <Route path="/usage" element={<UsagePage />} />
              <Route
                path="/connect"
                element={<SectionPage title="Connect" description="Tokens and setup for Claude, Cursor, Siri and other AI clients." />}
              />
              <Route path="/apps" element={<AppsPage />} />
              <Route path="/apps/:slug" element={<AppPage />} />
              <Route path="*" element={<Navigate to="/keys" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Authenticated>
    </>
  );
}

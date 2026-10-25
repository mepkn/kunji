import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Shell } from "@/components/Shell";
import { Spinner } from "@/components/ui/spinner";
import { SectionPage } from "@/pages/SectionPage";
import { SignInPage } from "@/pages/SignInPage";

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
              <Route
                path="/keys"
                element={<SectionPage title="AI keys" description="Your own keys for Anthropic, OpenAI, Gemini, Groq or any OpenAI-compatible API." />}
              />
              <Route
                path="/connect"
                element={<SectionPage title="Connect" description="Tokens and setup for Claude, Cursor, Siri and other AI clients." />}
              />
              <Route
                path="/apps"
                element={<SectionPage title="Apps" description="The apps whose tools your AI clients can use." />}
              />
              <Route path="*" element={<Navigate to="/keys" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Authenticated>
    </>
  );
}

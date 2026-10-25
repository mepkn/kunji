import { NavLink, Outlet } from "react-router";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { AppWindow, BarChart3, KeyRound, LogOut, Plug } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sections = [
  { to: "/keys", label: "AI keys", icon: KeyRound },
  { to: "/usage", label: "Usage", icon: BarChart3 },
  { to: "/connect", label: "Connect", icon: Plug },
  { to: "/apps", label: "Apps", icon: AppWindow },
];

/** The signed-in layout: top bar with the sections, page below. */
export function Shell() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 h-14 flex items-center gap-4">
          <NavLink to="/keys" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg?v=2" alt="" className="size-6" />
            <span className="hidden sm:inline">Kunji</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            {sections.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                aria-label={label}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground",
                    isActive && "bg-muted text-foreground",
                  )
                }
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:inline text-sm text-muted-foreground">{me?.email}</span>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

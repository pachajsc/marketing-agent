"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { DashboardIcon, LogoutIcon, ProspectsIcon, SettingsIcon, StrategyIcon } from "./icons";
import { initials } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Hoy", Icon: DashboardIcon },
  { href: "/prospects", label: "Prospectos", Icon: ProspectsIcon },
  { href: "/strategy", label: "Estrategia", Icon: StrategyIcon },
  { href: "/settings", label: "Ajustes", Icon: SettingsIcon },
] as const;

interface AppShellProps {
  user: { name: string; email: string };
  children: ReactNode;
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Layout autenticado. En el celular (uso principal) la navegación va abajo,
 * al alcance del pulgar. En escritorio es el lomo negro de la guía, a la
 * izquierda, con la marca arriba y el usuario abajo.
 */
export function AppShell({ user, children }: AppShellProps) {
  const isActive = useActive();

  return (
    <div className="min-h-screen bg-plano">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col bg-tinta text-hoja lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 pb-6 pt-6">
          <Marca />
          <span className="indice text-lg font-extrabold leading-none">AI Marketing Agent</span>
        </Link>

        <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                  active ? "bg-tapa text-tinta" : "text-hoja/75 hover:bg-white/10 hover:text-hoja"
                }`}
              >
                <Icon />
                {label}
              </Link>
            );
          })}
        </nav>

        <UserFooter user={user} />
      </aside>

      <main className="lg:pl-56">{children}</main>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-tinta bg-hoja pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                    active ? "text-tinta" : "text-grafito"
                  }`}
                >
                  {active && <span aria-hidden="true" className="absolute inset-x-5 top-0 h-1 rounded-b-sm bg-tapa" />}
                  <Icon />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Marca: el cuadro amarillo de la tapa con la inicial, como el logo de una guía. */
function Marca() {
  return (
    <span aria-hidden="true" className="indice flex h-8 w-8 items-center justify-center rounded-[3px] bg-tapa text-base font-extrabold text-tinta">
      AI
    </span>
  );
}

function UserFooter({ user }: { user: AppShellProps["user"] }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 border-t border-white/15 px-4 py-4">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-hoja"
      >
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-hoja">{user.name}</p>
        <p className="truncate text-xs text-hoja/65">{user.email}</p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={signingOut}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className="rounded-md p-2 text-hoja/70 transition-colors hover:bg-white/10 hover:text-hoja disabled:opacity-50"
      >
        <LogoutIcon />
      </button>
    </div>
  );
}

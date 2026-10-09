import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Login y registro: la tapa amarilla de la guía arriba, con la marca y la
 * promesa, y el formulario como la primera hoja impresa debajo.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-plano">
      <header className="border-b-2 border-tinta bg-tapa">
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-8 pt-8">
          <Link href="/" className="flex items-center gap-2.5 text-tinta">
            <span aria-hidden="true" className="indice flex h-8 w-8 items-center justify-center rounded-[3px] bg-tinta text-base font-extrabold text-tapa">
              AI
            </span>
            <span className="indice text-lg font-extrabold leading-none">AI Marketing Agent</span>
          </Link>
          <p className="indice text-[1.7rem] font-extrabold leading-[1.05] text-tinta text-balance">
            Negocios reales, ordenados por a quién escribirle primero.
          </p>
        </div>
      </header>
      <main className="mx-auto -mt-4 w-full max-w-md flex-1 px-4 pb-12">
        <div className="rounded-md border border-renglon bg-hoja p-5 shadow-[0_10px_30px_-18px_rgba(20,20,20,0.45)] sm:p-6">{children}</div>
      </main>
    </div>
  );
}

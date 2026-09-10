import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Marketing Agent
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Contale qué producto o servicio vendés y te ayudamos a identificar tu
          cliente ideal y dónde encontrarlo.
        </p>
        <Link
          href="/questionnaire"
          className="rounded-full bg-black px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Empezar
        </Link>
      </main>
    </div>
  );
}

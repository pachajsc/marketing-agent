import Link from "next/link";

// Pasos del producto, en el orden en que el usuario los recorre.
const STEPS = [
  { title: "Contanos qué vendés", detail: "Tu producto o servicio y el problema que resuelve." },
  { title: "A quién y dónde", detail: "El tipo de cliente que buscás y la zona." },
  { title: "Prospectos reales, priorizados", detail: "Negocios reales cerca de tu zona, ordenados por a quién contactar primero." },
  { title: "Un mensaje listo para revisar", detail: "Personalizado con datos reales del prospecto. Lo revisás, lo aprobás y lo copiás." },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Encontrá a quién venderle, y qué decirle
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Decime qué vendés y a quién querés venderle. Encontramos prospectos reales, identificamos
            cuáles tienen mayor potencial y te preparamos un mensaje personalizado para contactarlos.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-medium text-white dark:bg-white dark:text-black">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-black dark:text-white">{step.title}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="rounded-full bg-black px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Crear cuenta
            </Link>
            <Link href="/login" className="text-sm font-medium text-zinc-700 underline hover:text-black dark:text-zinc-300 dark:hover:text-white">
              Iniciar sesión
            </Link>
            <Link href="/questionnaire" className="text-sm text-zinc-500 underline hover:text-black dark:text-zinc-400 dark:hover:text-white">
              Probar sin cuenta
            </Link>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Toma unos minutos. Nada se envía automáticamente: vos decidís a quién contactar. Sin cuenta, el resultado
            no se guarda.
          </p>
        </div>
      </main>
    </div>
  );
}

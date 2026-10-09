import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { DemoBanner } from "@/components/DemoBanner";

// Archivo con eje de ancho: condensado para el índice (nombres, placas,
// títulos) y ancho normal para leer. Una sola familia, autoalojada por next/font.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "AI Marketing Agent",
  description:
    "Decime qué vendés y a quién querés venderle: encontramos prospectos reales, los priorizamos y te preparamos un mensaje para contactarlos.",
};

export const viewport: Viewport = {
  themeColor: "#f2c12e",
  colorScheme: "light",
};

// Contrato de dirección (impeccable): queda como comentario HTML en el body.
const DIRECTION_CONTRACT = `<!--
THESIS: Los prospectos como el índice de una guía de calles: ordenados por prioridad, con placa y referencia para salir a buscarlos. Rechaza el panel CRM de KPIs, tarjetas y tablas.
OWN-WORLD: Tapa amarilla #F2C12E sobre papel de plano #F4F6F3 y tinta #141414; leyenda de plano (avenida, agua, plaza) con un rol cada color. Archivo condensado para el índice; placas negras numeradas; estados por relleno (contorno, rayado, lleno, sello); pestañas al canto.
STORY: El emprendedor abre la app en el celular, ve a quién contactar primero, abre la ficha, aprueba el mensaje, lo copia a WhatsApp y lo marca contactado.
FIRST VIEWPORT: Mobile: tapa amarilla con categoría, zona y el pendiente de hoy; debajo, las primeras entradas del índice con placa, dirección, prioridad y estado; navegación abajo, al alcance del pulgar; acción principal en la tapa.
FORM: Guía de calles, candidato 4 de 7; seed 2ba439d5.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}

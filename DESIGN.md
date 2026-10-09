---
name: AI Marketing Agent
description: Prospectos reales, ordenados como el índice de una guía de calles.
colors:
  tapa: "#f2c12e"
  tapa-hondo: "#d9a514"
  tinta: "#141414"
  grafito: "#4f544f"
  lapiz: "#697068"
  plano: "#f4f6f3"
  hoja: "#ffffff"
  renglon: "#d8ddd6"
  avenida: "#c2312a"
  agua: "#2a63a6"
  plaza: "#3f7f40"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.85rem"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 75"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  placa: "3px"
  md: "6px"
spacing:
  page-x: "16px"
  page-x-sm: "24px"
  entry-y: "16px"
components:
  button-primary:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.hoja}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.hoja}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  placa:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.tapa}"
    rounded: "{rounded.placa}"
    size: "32px"
  input:
    backgroundColor: "{colors.hoja}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  tapa:
    backgroundColor: "{colors.tapa}"
    textColor: "{colors.tinta}"
---

# Design System: AI Marketing Agent

## Overview

**Creative North Star: "Guía de calles"**

La app es el índice de una guía de calles de bolsillo: una tapa amarilla que dice qué hay y dónde, y debajo las entradas ordenadas, cada una con su placa numerada y su referencia para salir a buscarla. Está hecha para el celular, a la luz del día y con una mano: tema claro, contraste alto, acciones abajo.

La densidad es la de un índice impreso: filas compactas separadas por filetes, nombres en Archivo condensado, cifras tabulares. La expresión vive en tres lugares precisos: la tapa amarilla, la placa negra del número de orden y la leyenda de estados por relleno. Todo lo demás es papel, tinta y filete. Rechaza explícitamente el registro de CRM corporativo (paneles de KPIs, tarjetas apiladas, tablas densas).

**Key Characteristics:**
- Tapa amarilla con filete de tinta como cabecera de cada pantalla.
- Prospectos como entradas de índice con placa negra numerada.
- Estados legibles por relleno, no solo por color.
- Navegación abajo en el celular; lomo negro en escritorio.
- Una sola familia tipográfica con eje de ancho.

## Colors

La leyenda de una guía: amarillo de tapa, tinta, papel de plano frío y tres colores del plano, cada uno con un solo rol.

### Primary
- **Amarillo de tapa** (tapa): fondo de la cabecera de cada pantalla, pestaña activa, sección activa de la navegación, selección de texto y aro de foco. Nunca como color de texto.
- **Amarillo en sombra** (tapa-hondo): borde de los supuestos en la estrategia y bordes sobre amarillo.

### Secondary
- **Agua** (agua): enlaces, sello de "Contactado" y estado "Respondió".
- **Plaza** (plaza): aprobado y "Calificado".
- **Avenida** (avenida): errores y descarte.

### Neutral
- **Tinta** (tinta): texto principal, botón principal, placas y lomo de navegación.
- **Grafito** (grafito): texto secundario.
- **Lápiz** (lapiz): texto terciario y placeholders.
- **Papel de plano** (plano): fondo de la app.
- **Hoja** (hoja): superficies de contenido.
- **Renglón** (renglon): filetes y bordes.

### Named Rules
**The One Role Rule.** Cada color del plano tiene un solo significado: agua es enlace o respuesta, plaza es aprobado, avenida es error o descarte. No se usan como decoración.

**The Tapa Is a Field Rule.** El amarillo ocupa campos enteros (la tapa, la pestaña activa), nunca acentos sueltos sobre el papel.

## Typography

**Display Font:** Archivo condensado (eje de ancho al 75 %), con system-ui
**Body Font:** Archivo a ancho normal, con system-ui

**Character:** una sola familia con dos anchos: el condensado es la voz del índice (nombres, placas, títulos) y el ancho normal es para leer.

### Hierarchy
- **Display** (800, 1.85rem → 2.25rem desde sm, 1.02): título de la tapa.
- **Title** (700, 1.125rem, 1.25, condensado): títulos de sección y nombre de cada entrada.
- **Body** (400, 0.875rem, 1.5): referencias, razones, textos de ayuda. El mensaje usa 1rem.
- **Label** (600, 0.75rem, 0.06em, mayúsculas): rótulos de datos y estado del mensaje.

### Named Rules
**The Tabular Rule.** Toda cifra (score, reseñas, conteos, número de orden) usa cifras tabulares: las columnas no bailan.

**The Index Voice Rule.** El ancho condensado se reserva para nombres, placas y títulos; los párrafos nunca van condensados.

## Layout

Columna única en el celular, con 16px de margen lateral (24px desde sm) y 112px de aire abajo para la barra de navegación. En escritorio el contenido se centra en 48–64rem y algunas pantallas suman una columna lateral de 18–19rem (registro, datos del negocio). Las listas son hojas blancas con entradas separadas por filetes, no tarjetas sueltas. La acción principal de la ficha queda fija abajo en el celular, sobre la navegación.

## Elevation & Depth

Plano por defecto: la profundidad la dan el papel, la hoja blanca y el filete. Hay una sola sombra suave, para lo que flota sobre el contenido (la tarjeta de login y el panel desplegable de filtros).

### Shadow Vocabulary
- **Hoja flotante** (`box-shadow: 0 10px 30px -18px rgba(20,20,20,0.45)`): tarjeta de login y panel de filtros.

### Named Rules
**The Flat Sheet Rule.** Las hojas apoyadas no llevan sombra: borde de renglón o sombra, nunca ambos.

## Shapes

Esquinas casi rectas, como un impreso: 6px en hojas, botones e inputs; 3px en placas y en la marca. Las pestañas de estado tienen solo las esquinas superiores redondeadas, como las del canto de una guía. Los avatares son el único círculo.

## Components

### Buttons
- **Shape:** esquinas de 6px, alto mínimo de 44px (área táctil).
- **Primary:** tinta con texto blanco; se hunde 1px al presionar.
- **Secondary:** hoja blanca con borde de tinta.
- **Ghost:** sin fondo, texto grafito; para acciones de menor peso (rechazar, restaurar, escribir otro).

### Placa
- **Style:** número de orden en Archivo condensado extrabold, amarillo sobre tinta, esquinas de 3px. 32px en las entradas, 48px en la tapa de la ficha.

### Marca de estado
- **Style:** cuadrado de 12px con borde de 1.5px. Nuevo: contorno; Listo para contactar: rayado amarillo; Contactado: lleno tinta; Respondió: lleno agua; Calificado: lleno plaza; Descartado: contorno lápiz tachado. Siempre acompañada del nombre del estado. La leyenda "Referencias" la explica en la lista.

### Entrada del índice
- **Style:** fila sobre hoja: placa, nombre condensado, dirección corta, prioridad con su porqué en una línea, y datos chicos (tipo, rating, teléfono, sitio). Toda la fila es el enlace a la ficha. Las entradas aparecen escalonadas una vez al cargar.

### Inputs / Fields
- **Style:** hoja blanca, borde de renglón, esquinas de 6px.
- **Focus:** borde de tinta más el aro global de foco (2px tinta y halo amarillo de tapa).

### Navigation
- **Mobile:** barra inferior fija con cuatro secciones (Hoy, Prospectos, Estrategia, Ajustes), filete de tinta arriba; la activa lleva una pestaña amarilla arriba y texto en tinta.
- **Desktop:** lomo de tinta de 224px a la izquierda; la sección activa es un campo amarillo.

### Sello de contactado
- **Style:** rótulo condensado en mayúsculas con borde de 2.5px en agua, inclinado -6°, que se estampa una vez cuando el prospecto ya fue contactado.

## Do's and Don'ts

### Do:
- **Do** abrir cada pantalla con la tapa amarilla y el título en el índice condensado.
- **Do** mostrar el estado con su relleno de la leyenda y su nombre, nunca solo con color.
- **Do** acompañar cada prioridad con su porqué (score más la señal que más pesó).
- **Do** dejar la acción principal al alcance del pulgar en el celular.

### Don't:
- **Don't** armar paneles de KPIs con números grandes ni tarjetas apiladas: los conteos van como línea de referencia en la tapa.
- **Don't** usar los colores del plano como decoración ni fuera de su rol.
- **Don't** agregar modo oscuro a la app: la escena es el celular a la luz del día.
- **Don't** usar el rayado amarillo para otra cosa que "Listo para contactar".

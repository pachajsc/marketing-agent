"use client";

import { useSyncExternalStore } from "react";

function greetingFor(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

const noop = () => () => undefined;

/** Saludo según la hora local del usuario (no la del servidor). En el render del servidor dice "Hola". Solo texto: el título lo pone la tapa. */
export function Greeting({ name }: { name: string }) {
  const greeting = useSyncExternalStore(noop, () => greetingFor(new Date().getHours()), () => "Hola");
  const firstName = name.trim().split(/\s+/)[0] || name;
  return (
    <>
      {greeting}, {firstName}
    </>
  );
}

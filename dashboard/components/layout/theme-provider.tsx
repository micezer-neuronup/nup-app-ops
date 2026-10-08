"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes inyecta un <script> inline para evitar el FOUC (flash of unstyled content).
// React 19 avisa sobre cualquier <script> renderizado dentro de un componente cliente.
// Es un falso positivo: el script sí se ejecuta correctamente en SSR.
// Filtramos únicamente ese mensaje para no ensuciar la consola.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag")
    ) {
      return;
    }
    origError.apply(console, args);
  };
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
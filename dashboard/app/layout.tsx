import { cookies } from "next/headers";
import type { Metadata } from "next";





// ────── layout.tsx ───────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── First thing that renders when the iframe opens in Hubspot is the layout. Its the skeleton
// ─── Doesnt care about data or props, just builds the skeleton
// ─── Reads cookies on the server to remember the theme defined before opening the iframe
// ─── The tag suppressHydrationWarning allows React to accept theme changes in the html code (dark-light)
// ─── The 'body' uses the 'cn' utility to merge base Tailwind classes with the dynamic theme cookies
// ─── Providers (ThemeProvider & ActiveThemeProvider) act as umbrellas to provide global context to the app
// ─── Finally, {children} is the exact slot where the requested page (page.tsx) is injected
// ─────────────────────────────────────────────────────────────────────────────────────────────


import "./globals.css";

import { cn } from "@/lib/utils";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get("active_theme")?.value;
  const isScaled = activeThemeValue?.endsWith("-scaled");

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background overscroll-none font-sans antialiased",
          activeThemeValue ? `theme-${activeThemeValue}` : "",
          isScaled ? "theme-scaled" : ""
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <ActiveThemeProvider initialTheme={activeThemeValue}>
            {children}
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
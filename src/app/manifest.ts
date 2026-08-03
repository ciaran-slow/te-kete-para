import type { MetadataRoute } from "next";
import { en } from "@/lib/i18n/dictionaries";

/* Hex values here must stay in lockstep with the --color-moana / --color-papa
   custom properties in globals.css (ADR 0004) — the Web Manifest spec has no
   mechanism to read CSS custom properties at request time. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: en["app.name"],
    short_name: "Kete Para",
    description: en["app.description"],
    start_url: "/",
    display: "standalone",
    lang: "en",
    background_color: "#f8fafc", // --color-papa
    theme_color: "#003b46", // --color-moana
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

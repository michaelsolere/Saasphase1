import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mise-bas — SaaS Élevage",
    short_name: "Mise-bas",
    description: "Enregistrement mobile sécurisé des mises-bas et des naissances.",
    id: "/whelping",
    start_url: "/whelping",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f4",
    theme_color: "#315c43",
    lang: "fr-FR",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/pwa/whelping-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/whelping-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/whelping-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import { expect, test } from "@playwright/test";

import createManifest from "../../src/app/manifest";

test("décrit exactement l’application de mise-bas installable", () => {
  const manifest = createManifest();

  expect(manifest).toMatchObject({
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
  });
  expect(manifest.prefer_related_applications).not.toBe(true);
  expect(manifest.icons).toEqual([
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
  ]);
});

test("ne place aucune donnée personnelle dans l’identité de démarrage", () => {
  const manifest = createManifest();
  const serialized = JSON.stringify(manifest);

  expect(manifest.id).toBe("/whelping");
  expect(manifest.start_url).toBe("/whelping");
  expect(String(manifest.start_url)).not.toContain("?");
  expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(serialized).not.toMatch(/supabase|token|secret|command|litter=/i);
});

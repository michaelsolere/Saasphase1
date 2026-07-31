import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

const repoRoot = process.cwd();

const icons = [
  ["public/pwa/whelping-icon-192.png", 192],
  ["public/pwa/whelping-icon-512.png", 512],
  ["public/pwa/whelping-icon-maskable-512.png", 512],
  ["public/pwa/apple-touch-icon-180.png", 180],
] as const;

for (const [relativePath, expectedSize] of icons) {
  test(`${relativePath} est un PNG opaque ${expectedSize} × ${expectedSize}`, async () => {
    const absolutePath = resolve(repoRoot, relativePath);
    const [fileStats, metadata] = await Promise.all([
      stat(absolutePath),
      sharp(absolutePath).metadata(),
    ]);

    expect(fileStats.size).toBeGreaterThan(0);
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(expectedSize);
    expect(metadata.height).toBe(expectedSize);
    expect(metadata.hasAlpha).toBe(false);
    await expect(sharp(absolutePath).raw().toBuffer()).resolves.not.toHaveLength(0);
  });
}

test("les ressources d’icône restent locales", async () => {
  const source = await readFile(resolve(repoRoot, "src/app/manifest.ts"), "utf8");

  expect(source).not.toMatch(/https?:\/\//i);
  expect(source).not.toMatch(/data:/i);
  expect(source).toContain('src: "/pwa/whelping-icon-192.png"');
  expect(source).toContain('src: "/pwa/whelping-icon-512.png"');
  expect(source).toContain('src: "/pwa/whelping-icon-maskable-512.png"');
});

test("le service worker reste strictement réseau et limité aux navigations mise-bas", async () => {
  const source = await readFile(resolve(repoRoot, "public/whelping-sw.js"), "utf8");

  expect(source).toContain("self.skipWaiting()");
  expect(source).toContain("self.clients.claim()");
  expect(source).toContain('request.mode === "navigate"');
  expect(source).toContain('url.origin === self.location.origin');
  expect(source).toContain('url.pathname === "/whelping"');
  expect(source).toContain('url.pathname.startsWith("/whelping/")');
  expect(source).toContain("if (!isWhelpingNavigation) return");
  expect(source).not.toMatch(/respondWith/i);
  expect(source).not.toMatch(/caches?\.(?:open|match|delete)|CacheStorage/i);
  expect(source).not.toMatch(/indexedDB/i);
  expect(source).not.toMatch(/addEventListener\(["'](?:sync|push)["']/i);
  expect(source).not.toMatch(/supabase/i);
  expect(source).not.toMatch(/offline|fallback/i);
});

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const expectedDescription =
  "Enregistrement mobile sécurisé des mises-bas et des naissances.";

function businessCounts() {
  return JSON.parse(
    runE2eSqlSync(`select json_build_object(
      'animals',(select count(*) from public.animals),
      'litters',(select count(*) from public.litters),
      'whelping_sessions',(select count(*) from public.whelping_sessions),
      'whelping_events',(select count(*) from public.whelping_events),
      'whelping_births',(select count(*) from public.whelping_births),
      'whelping_commands',(select count(*) from public.whelping_commands),
      'animal_weight_measurements',(select count(*) from public.animal_weight_measurements),
      'litter_weighing_sessions',(select count(*) from public.litter_weighing_sessions),
      'litter_weight_commands',(select count(*) from public.litter_weight_commands)
    )::text;`),
  ) as Record<string, number>;
}

async function submitLogin(page: Page) {
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function primeExistingMobileSelection(
  context: BrowserContext,
  page: Page,
) {
  await page.goto("/login");
  await submitLogin(page);
  await expect(page).toHaveURL(/\/candidatures\?connexion=success$/, {
    timeout: 30_000,
  });

  await page.goto("/whelping/selection?litter=0");
  await expect(page.getByRole("heading", { name: "Mise-bas mobile" })).toBeVisible({
    timeout: 45_000,
  });
  const selectedLitter = await page.getByLabel("Portée affichée").inputValue();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mise-bas mobile" })).toBeVisible({
    timeout: 30_000,
  });
  const selectionCookie = (
    await context.cookies("http://127.0.0.1:3100/whelping")
  ).find((cookie) => cookie.name === "whelping_mobile_selection");
  expect(selectionCookie).toMatchObject({
    httpOnly: true,
    path: "/whelping",
    sameSite: "Lax",
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/candidatures");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login\?deconnexion=success$/, {
    timeout: 30_000,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    (await context.cookies("http://127.0.0.1:3100/whelping")).some(
      (cookie) => cookie.name === "whelping_mobile_selection",
    ),
  ).toBe(true);
  return selectedLitter;
}

async function loginFromWhelping(page: Page) {
  await page.goto("/whelping");
  await expect(page).toHaveURL(/\/login\?next=(?:%2F|\/)whelping$/);
  const selectionCookieBeforeLogin = (
    await page.context().cookies("http://127.0.0.1:3100/whelping")
  ).some((cookie) => cookie.name === "whelping_mobile_selection");
  expect(selectionCookieBeforeLogin).toBe(true);
  await submitLogin(page);
  await expect(page.getByRole("heading", { name: "Mise-bas mobile" })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page).toHaveURL(/\/whelping$/);
}

async function clearPwaBrowserState(page: Page) {
  return page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    return {
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      caches: await caches.keys(),
    };
  });
}

async function verifyBrowserMode(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  try {
    const primedSelection = await primeExistingMobileSelection(context, page);
    await loginFromWhelping(page);
    await expect(page.locator("[data-private-shell], [data-sidebar-desktop]")).toHaveCount(0);

    const selectedLitter = await page.getByLabel("Portée affichée").inputValue();
    expect(selectedLitter).toBe(primedSelection);
    await page.reload();
    await expect(page.getByLabel("Portée affichée")).toHaveValue(selectedLitter);

    const cleanStart = await clearPwaBrowserState(page);
    expect(cleanStart).toEqual({ registrations: 0, caches: [] });

    const supabaseMutations: string[] = [];
    const serverActionRequests: string[] = [];
    page.on("request", (request) => {
      const method = request.method();
      const url = request.url();
      if (
        !["GET", "HEAD", "OPTIONS"].includes(method) &&
        url.startsWith("http://127.0.0.1:55321/rest/v1/")
      ) {
        supabaseMutations.push(`${method} ${url}`);
      }
      if (method === "POST" && url.startsWith("http://127.0.0.1:3100/")) {
        serverActionRequests.push(url);
      }
    });

    const countsBefore = businessCounts();
    await page.reload();

    const serviceWorkerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (worker && worker.state !== "activated") {
        await new Promise<void>((resolve) => {
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") resolve();
          });
        });
      }
      return {
        scriptPath: worker ? new URL(worker.scriptURL).pathname : null,
        scopePath: new URL(registration.scope).pathname,
        state: worker?.state ?? null,
        cacheNames: await caches.keys(),
      };
    });
    const countsAfter = businessCounts();

    expect(serviceWorkerState).toEqual({
      scriptPath: "/whelping-sw.js",
      scopePath: "/",
      state: "activated",
      cacheNames: [],
    });
    expect(supabaseMutations).toEqual([]);
    expect(serverActionRequests).toEqual([]);
    expect(countsAfter).toEqual(countsBefore);

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(
      page.locator('link[rel="icon"][href="/pwa/whelping-icon-192.png"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="apple-touch-icon"][href="/pwa/apple-touch-icon-180.png"]'),
    ).toHaveCount(1);
    await expect(page).toHaveTitle("Mise-bas — SaaS Élevage");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      expectedDescription,
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#315c43",
    );
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      "content",
      "yes",
    );
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Mise-bas",
    );

    const panel = page.locator('[data-whelping-installation-panel="browser"]');
    await expect(
      panel.getByRole("heading", { name: "Installer l’outil de mise-bas" }),
    ).toBeVisible();
    await expect(panel).toContainText("Sur iPhone ou iPad");
    await expect(panel).toContainText("Sur Android ou ordinateur");
    await expect(panel).toContainText("Une connexion réseau reste obligatoire");
    await expect(panel.getByRole("button")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const metadataMarkup = await page
      .locator(
        'title, link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"], meta[name="description"], meta[name="theme-color"], meta[name^="apple-mobile-web-app"]',
      )
      .evaluateAll((elements) => elements.map((element) => element.outerHTML).join("\n"));
    const privateMarkup = `${await panel.evaluate((element) => element.outerHTML)}\n${metadataMarkup}`;
    expect(privateMarkup).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(privateMarkup).not.toMatch(/anon[_-]?key|access[_-]?token|client[_-]?command|litter=/i);
    expect(privateMarkup).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);

    const finalBrowserState = await clearPwaBrowserState(page);
    expect(finalBrowserState).toEqual({ registrations: 0, caches: [] });
    console.info(`Whelping PWA business counts unchanged: ${JSON.stringify(countsAfter)}`);
  } finally {
    if (!page.isClosed()) await clearPwaBrowserState(page).catch(() => undefined);
    await context.close();
  }
}

async function verifyStandaloneMode(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query !== "(display-mode: standalone)") return nativeMatchMedia(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      };
    };
  });
  const page = await context.newPage();

  try {
    await primeExistingMobileSelection(context, page);
    await loginFromWhelping(page);
    const panel = page.locator('[data-whelping-installation-panel="standalone"]');
    await expect(
      panel.getByRole("heading", { name: "Mode application installé" }),
    ).toBeVisible();
    await expect(panel).toContainText("Cette icône ouvre directement le mode de mise-bas");
    await expect(panel).toContainText("Une connexion réseau reste nécessaire");
    await expect(panel).not.toContainText("Sur iPhone ou iPad");
    await expect(panel).not.toContainText("Sur Android ou ordinateur");
    await expect(panel.getByRole("button")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate((element) => element.outerHTML)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  } finally {
    if (!page.isClosed()) await clearPwaBrowserState(page).catch(() => undefined);
    await context.close();
  }
}

test("rend le mode mise-bas installable sans cache ni écriture métier", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
  await expect(manifestResponse.json()).resolves.toMatchObject({
    name: "Mise-bas — SaaS Élevage",
    short_name: "Mise-bas",
    description: expectedDescription,
    id: "/whelping",
    start_url: "/whelping",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f4",
    theme_color: "#315c43",
    lang: "fr-FR",
    prefer_related_applications: false,
  });

  for (const path of [
    "/pwa/whelping-icon-192.png",
    "/pwa/whelping-icon-512.png",
    "/pwa/whelping-icon-maskable-512.png",
    "/pwa/apple-touch-icon-180.png",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("image/png");
  }

  const serviceWorkerResponse = await request.get("/whelping-sw.js");
  expect(serviceWorkerResponse.status()).toBe(200);
  expect(serviceWorkerResponse.headers()["content-type"]).toMatch(/javascript/);

  await verifyBrowserMode(browser);
  await verifyStandaloneMode(browser);
});

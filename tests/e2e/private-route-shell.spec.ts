import { expect, test } from "@playwright/test";

import {
  canRenderPrivateShell,
  isPublicRoute,
  isStandalonePrivateRoute,
  shouldShowPrivateSidebar,
} from "../../src/lib/private-route-shell";

test("conserve le shell pendant la résolution de session", () => {
  expect(canRenderPrivateShell("loading")).toBe(true);
  expect(canRenderPrivateShell("authenticated")).toBe(true);
  expect(canRenderPrivateShell("unauthenticated")).toBe(false);
});

test("routes publiques explicites (préfixe inclus)", () => {
  expect(isPublicRoute("/login")).toBe(true);
  expect(isPublicRoute("/candidature")).toBe(true);
  expect(isPublicRoute("/candidature/golden-retriever-2026")).toBe(true);
  expect(isPublicRoute("/suivi/questionnaire")).toBe(true);
  expect(isPublicRoute("/suivi/token-opaque")).toBe(true);
  expect(isPublicRoute("/choix/rendez-vous")).toBe(true);
  expect(isPublicRoute("/choix/token-opaque")).toBe(true);
  expect(isPublicRoute("/candidatures")).toBe(false);
  expect(isPublicRoute("/calendar")).toBe(false);
});

test("route autonome mise-bas mobile volontaire", () => {
  expect(isStandalonePrivateRoute("/whelping")).toBe(true);
  expect(isStandalonePrivateRoute("/whelping/selection")).toBe(true);
  expect(isStandalonePrivateRoute("/litters")).toBe(false);
});

test("sidebar par défaut pour toute route privée authentifiée inconnue", () => {
  expect(shouldShowPrivateSidebar("/future-private-module", true)).toBe(true);
  expect(shouldShowPrivateSidebar("/calendar", true)).toBe(true);
  expect(shouldShowPrivateSidebar("/calendar/today", true)).toBe(true);
  expect(shouldShowPrivateSidebar("/", true)).toBe(true);
  expect(shouldShowPrivateSidebar("/settings/organization", true)).toBe(true);
});

test("pas de sidebar sans session, ni sur public / autonome", () => {
  expect(shouldShowPrivateSidebar("/calendar", false)).toBe(false);
  expect(shouldShowPrivateSidebar("/future-private-module", false)).toBe(false);
  expect(shouldShowPrivateSidebar("/login", true)).toBe(false);
  expect(shouldShowPrivateSidebar("/candidature/x", true)).toBe(false);
  expect(shouldShowPrivateSidebar("/suivi/questionnaire", true)).toBe(false);
  expect(shouldShowPrivateSidebar("/choix/rendez-vous", true)).toBe(false);
  expect(shouldShowPrivateSidebar("/whelping", true)).toBe(false);
});

test("ne fabrique pas de routes publiques inventées", () => {
  expect(isPublicRoute("/future-public-guess")).toBe(false);
  expect(shouldShowPrivateSidebar("/future-public-guess", true)).toBe(true);
});

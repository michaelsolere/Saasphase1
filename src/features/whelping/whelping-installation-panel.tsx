"use client";

import { useEffect, useState } from "react";

import {
  getWhelpingAppDisplayMode,
  type WhelpingAppDisplayMode,
} from "@/features/whelping/whelping-pwa-display-mode";

const standaloneMediaQuery = "(display-mode: standalone)";

export function WhelpingInstallationPanel() {
  const [displayMode, setDisplayMode] =
    useState<WhelpingAppDisplayMode>("browser");

  useEffect(() => {
    const mediaQuery = window.matchMedia(standaloneMediaQuery);
    const refreshDisplayMode = () => {
      setDisplayMode(getWhelpingAppDisplayMode(window));
    };

    refreshDisplayMode();
    mediaQuery.addEventListener?.("change", refreshDisplayMode);

    return () => {
      mediaQuery.removeEventListener?.("change", refreshDisplayMode);
    };
  }, []);

  if (displayMode === "standalone") {
    return (
      <section
        aria-labelledby="whelping-installation-title"
        className="my-5 rounded-xl border bg-surface px-4 py-4 text-sm"
        data-whelping-installation-panel="standalone"
      >
        <h2 id="whelping-installation-title" className="font-semibold">
          Mode application installé
        </h2>
        <p className="mt-2 leading-6 text-muted">
          Cette icône ouvre directement le mode de mise-bas.
        </p>
        <p className="mt-1 leading-6 text-muted">
          Une connexion réseau reste nécessaire pour consulter et enregistrer les données.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="whelping-installation-title"
      className="my-5 rounded-xl border bg-surface px-4 py-4 text-sm"
      data-whelping-installation-panel="browser"
    >
      <h2 id="whelping-installation-title" className="font-semibold">
        Installer l’outil de mise-bas
      </h2>
      <p className="mt-2 leading-6 text-muted">
        Ajoutez une icône sur votre écran d’accueil pour ouvrir directement ce mode.
      </p>
      <p className="mt-2 leading-6 text-muted">
        Sur iPhone ou iPad : utilisez Partager, puis « Sur l’écran d’accueil ».
      </p>
      <p className="mt-1 leading-6 text-muted">
        Sur Android ou ordinateur : utilisez le menu du navigateur, puis « Installer
        l’application » ou « Ajouter à l’écran d’accueil ».
      </p>
      <p className="mt-2 font-medium leading-6">
        Une connexion réseau reste obligatoire pour consulter ou enregistrer les données.
      </p>
    </section>
  );
}

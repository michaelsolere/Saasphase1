import { expect, test } from "@playwright/test";

import {
  buildCandidateWorkbenchPath,
  getCandidateNextAction,
  normalizeCandidateReturnPath,
  normalizeCandidateWorkbenchState,
} from "../../src/features/applications/candidate-workbench-model";

test("normalizes candidate workbench state without losing the active filter", () => {
  expect(
    normalizeCandidateWorkbenchState({
      filter: "validated",
      search: "  Martin  ",
      selectedId: "candidate-2",
      sort: "name",
    }),
  ).toEqual({
    filter: "validated",
    search: "Martin",
    selectedId: "candidate-2",
    sort: "name",
  });

  expect(
    buildCandidateWorkbenchPath({
      filter: "validated",
      search: "Martin",
      selectedId: "candidate-2",
      sort: "name",
    }),
  ).toBe(
    "/candidatures?filtre=validees&recherche=Martin&tri=nom&candidature=candidate-2",
  );
});

test("accepts only an internal candidate workbench return path", () => {
  expect(
    normalizeCandidateReturnPath(
      "/candidatures?filtre=validees&candidature=candidate-2",
    ),
  ).toBe("/candidatures?filtre=validees&candidature=candidate-2");
  expect(normalizeCandidateReturnPath("https://example.com")).toBe(
    "/candidatures",
  );
  expect(normalizeCandidateReturnPath("//example.com/candidatures")).toBe(
    "/candidatures",
  );
});

test("derives the qualification action from existing candidate evidence", () => {
  expect(getCandidateNextAction({ status: "new", preReservationProgressLabel: null }))
    .toMatchObject({ label: "Relire et qualifier", tone: "attention" });

  expect(
    getCandidateNextAction({
      status: "qualified",
      preReservationProgressLabel: null,
    }),
  ).toMatchObject({ label: "Préparer la pré-réservation", tone: "follow_up" });

  expect(
    getCandidateNextAction({
      status: "qualified",
      preReservationProgressLabel: "Demande de pré-réservation",
    }),
  ).toMatchObject({ label: "Vérifier le premier versement", tone: "attention" });

  expect(
    getCandidateNextAction({
      status: "qualified",
      preReservationProgressLabel: "Pré-réservation réglée",
    }),
  ).toMatchObject({ label: "Ouvrir le parcours adoptant", tone: "complete" });
});

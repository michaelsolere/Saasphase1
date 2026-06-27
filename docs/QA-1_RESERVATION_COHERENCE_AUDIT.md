# QA-1 — Audit cohérence réservation après actions

Date : 2026-06-27

## 1. Résumé exécutif

La séquence RES-UX-1 à RES-UX-8 a bien déplacé le centre opérationnel du dossier adoptant vers `/reservations/[id]`. La fiche réservation charge et affiche les informations clés du dossier, puis propose des actions manuelles ciblées : ajout de note interne, suivi documentaire, suivi de paiement demandé et attribution d'un animal existant.

L'audit confirme que les actions récentes restent globalement cohérentes avec le modèle existant : elles relisent les objets côté serveur, vérifient les liens de réservation et d'organisation, et ne changent pas automatiquement le statut de réservation. Les listes globales et fiches liées relisent les tables ou vues sources, donc elles devraient refléter les changements après navigation ou revalidation.

Les principaux risques ne sont pas des incohérences immédiates, mais des risques de divergence future : la page réservation est volumineuse, la logique de suivi est dupliquée entre réservation, dashboard, documents et listes, et le dashboard utilise encore ses propres règles d'attention plutôt que la même logique que la prochaine action de la fiche réservation.

Recommandation : lancer ensuite un lot de tests QA seedés ciblés (`QA-2`) ou un alignement dashboard (`DASH-2`) avant d'ajouter de nouvelles actions sensibles.

## 2. Fichiers inspectés

* `AGENTS.md`
* `README.md`
* `docs/PROJECT_LOG.md`
* `docs/RES-UX-1_RESERVATION_DETAIL_AUDIT.md`
* `src/app/reservations/[id]/page.tsx`
* `src/app/reservations/page.tsx`
* `src/features/reservations/actions.ts`
* `src/features/reservations/note-form.tsx`
* `src/features/reservations/reservation-list.tsx`
* `src/features/reservations/formatters.ts`
* `src/features/payments/actions.ts`
* `src/features/payments/payment-list.tsx`
* `src/features/payments/formatters.ts`
* `src/features/documents/actions.ts`
* `src/features/documents/document-list.tsx`
* `src/features/documents/formatters.ts`
* `src/app/page.tsx`
* `src/app/documents/page.tsx`
* `src/app/documents/[id]/page.tsx`
* `src/app/payments/page.tsx`
* `src/app/payments/[id]/page.tsx`
* `src/app/animals/[id]/page.tsx`

## 3. Cohérence fiche réservation

### Points cohérents

La fiche réservation relit les données sources utiles au dossier :

* `reservation_overview` pour le résumé principal ;
* `reservations` pour les champs éditables ou sensibles non exposés par la vue ;
* `payments` filtrés par `reservation_id` ;
* `documents` filtrés par `reservation_id` ;
* `notes` internes filtrées par `reservation_id`, `note_type = internal` et `visibility = internal` ;
* `animals` pour l'animal attribué ou les animaux attribuables ;
* `events` pour l'historique et le suivi post-adoption.

Le résumé haut de fiche, les sections paiements/documents/notes/animal, les liens métier et le retour tableau de bord sont cohérents avec la philosophie "Réservation = centre opérationnel".

### Points à surveiller

* Le fichier `src/app/reservations/[id]/page.tsx` est devenu très volumineux et mélange chargement de données, calculs, UI, diagnostics et formulaires.
* Certains calculs financiers existent aussi dans la liste réservations et le dashboard.
* La prochaine action de la fiche réservation est locale à la page ; le dashboard ne la réutilise pas.
* Les documents attendus restent suivis via documents existants et statuts, pas encore via une checklist partagée indépendante.

## 4. Cohérence paiements

### Ce qui est garanti par le code

L'action `markReservationPaymentAsPaid` :

* valide les UUID `payment_id` et `reservation_id` ;
* utilise l'utilisateur authentifié ;
* relit la réservation non supprimée ;
* relit le paiement non supprimé ;
* vérifie que le paiement est bien lié à la réservation ;
* vérifie la cohérence `organization_id` ;
* accepte uniquement le statut source `requested` ;
* écrit uniquement `status = paid`, `paid_at`, `updated_at` et `updated_by` ;
* ne crée aucun paiement ;
* ne supprime aucun paiement ;
* ne modifie ni montant, ni type, ni contact, ni réservation liée ;
* ne modifie pas le statut de réservation.

### Cohérence attendue après action

* `/reservations/[id]` doit afficher le paiement comme `Payé` avec `paid_at`.
* Les agrégats `paid_cents` / reste dû de `reservation_overview` devraient se recalculer côté base/vue si la vue est bien définie sur les paiements payés.
* `/payments` relit la table `payments` et devrait afficher le nouveau statut.
* `/payments/[id]` relit le paiement et devrait afficher `paid` et `paid_at`.
* Le dashboard ne remonte plus les paiements `paid`, car il filtre uniquement `requested`, `pending` et `partially_paid`.

### À tester manuellement

* Vérifier que `reservation_overview.paid_cents` se met bien à jour après passage `requested` → `paid`.
* Vérifier que le dashboard retire immédiatement le paiement après navigation/refresh.
* Vérifier que la liste réservations recalcule correctement le reste dû.

### Risque identifié

La cohérence financière dépend de la vue `reservation_overview`. Si cette vue ne tient pas compte exactement des mêmes statuts que l'UI, la fiche et la liste peuvent diverger.

## 5. Cohérence documents

### Ce qui est garanti par le code

Les actions `markDocumentAsSent` et `markDocumentAsSigned` :

* valident les UUID `document_id` et `reservation_id` ;
* utilisent l'utilisateur authentifié ;
* relisent la réservation ;
* relisent le document ;
* vérifient que le document est lié à la réservation courante ;
* vérifient la cohérence `organization_id` ;
* limitent les types aux documents actionnables depuis réservation ;
* passent `to_generate` → `sent` avec `sent_at` ;
* passent `sent` → `signed` avec `signed_at` ;
* ne génèrent aucun fichier ;
* n'envoient aucun email ;
* n'uploadent rien ;
* n'introduisent aucune signature électronique.

### Cohérence attendue après action

* `/reservations/[id]` relit les documents et affiche le statut à jour.
* `/documents/[id]` relit le document et affiche le statut à jour, avec les aperçus internes toujours accessibles.
* `/documents` relit la table `documents` et devrait afficher le nouveau statut.
* Le dashboard retire les documents `signed` de "Documents à traiter", car il filtre seulement `to_generate` et `sent`.

### À tester manuellement

* Marquer un document `to_generate` comme envoyé, puis vérifier réservation, liste documents, fiche document et dashboard.
* Marquer un document `sent` comme reçu signé, puis vérifier que le dashboard ne le remonte plus.
* Vérifier que le libellé `signed` reste bien affiché comme `Reçu signé` pour les documents adoptant prioritaires.

### Risque identifié

La liste documents appelle `getDocumentStatusLabel(document.status)` sans toujours passer le type documentaire. Le libellé spécifique `Reçu signé` dépend du type dans le formatter ; une légère divergence de vocabulaire peut donc exister entre fiche document/réservation et liste globale.

## 6. Cohérence notes

### Ce qui est garanti par le code

L'ajout de note interne depuis réservation :

* valide `reservation_id` et contenu non vide ;
* limite le contenu à 2 000 caractères ;
* utilise l'utilisateur authentifié ;
* relit la réservation non supprimée ;
* insère dans `notes` avec `reservation_id`, `organization_id`, `note_type = internal`, `visibility = internal`, `created_by` et `updated_by` ;
* revalide `/reservations` et `/reservations/[id]` ;
* ne modifie ni paiement, ni document, ni animal, ni statut.

### Cohérence attendue après action

* La note apparaît sur `/reservations/[id]`.
* Elle reste interne par type et visibilité.
* Elle n'apparaît pas dans l'interface publique.
* Elle ne déclenche aucun email ou automatisme.

### À envisager plus tard

* Une timeline du dossier pourrait afficher notes, paiements, documents et événements dans une même chronologie.
* Les notes liées à la réservation ne sont pas nécessairement visibles depuis la fiche contact ou candidature ; ce n'est pas incohérent, mais c'est un choix UX à cadrer.

## 7. Cohérence animal attribué

### Ce qui est garanti par le code

L'action `assignAnimalToReservation` :

* valide `reservation_id` et `animal_id` ;
* utilise l'utilisateur authentifié ;
* relit la réservation non supprimée ;
* refuse une réservation déjà liée à un animal ;
* refuse les statuts finaux ;
* relit l'animal non supprimé ;
* vérifie la cohérence `organization_id` ;
* vérifie la cohérence de portée si `reservation.litter_id` existe ;
* refuse un animal déjà lié à une autre réservation active ;
* écrit `reservations.animal_id`, `animal_assigned_at`, `updated_at` et `updated_by` ;
* ne modifie pas le statut de réservation ;
* ne modifie pas le statut de l'animal.

### Cohérence attendue après action

* `/reservations/[id]` affiche l'animal attribué.
* `/reservations` affiche `animal_display_name` via `reservation_overview`.
* `/animals/[id]` relit `reservation_overview` filtré par `animal_id` et devrait afficher la réservation liée.
* `/documents/[id]` peut exploiter l'animal via `document.animal_id` ou `relatedReservation.animal_id`.
* Les aperçus internes documentaires, notamment attestation de vente, devraient bénéficier de l'animal attribué dès que le document est lié à la réservation.
* La prochaine action de la réservation tient compte de `animal_id`.

### À tester manuellement

* Attribuer un animal et vérifier réservation, liste réservations, fiche animal, fiche document liée et dashboard.
* Vérifier qu'aucun statut réservation/animal ne change.
* Vérifier qu'un animal déjà attribué à une autre réservation active est refusé.

### Risque identifié

La fiche animal reflète la réservation liée, mais elle ne met pas spécialement en avant le fait qu'une attribution vient d'être faite. Une amélioration UX dédiée côté animal pourrait renforcer cette lecture croisée.

## 8. Cohérence dashboard

### État actuel

Le dashboard charge :

* candidatures `new` et `to_review` ;
* paiements `requested`, `pending`, `partially_paid` ;
* documents `to_generate` et `sent` ;
* réservations `pre_reservation_requested`, `pre_reservation_paid` ou avec arrhes complètes sans animal ;
* portées non closes.

### Cohérence positive

* Un paiement passé à `paid` ne doit plus être affiché dans "Paiements attendus".
* Un document passé à `signed` ne doit plus être affiché dans "Documents à traiter".
* Une réservation avec arrhes complètes et animal attribué ne rentre plus dans la règle `arrhes complètes sans animal`.

### Risques ou limites

* Le dashboard ne réutilise pas `getReservationNextAction`.
* Les réservations à suivre sont encore déterminées par quelques règles simples, surtout pré-réservation et arrhes complètes sans animal.
* Les nouveaux états possibles du dossier réservation ne sont pas tous reflétés dans le dashboard.
* Une action effectuée depuis la fiche réservation peut rendre la fiche cohérente sans que le dashboard affiche exactement la même priorité métier.

## 9. Cohérence navigation

### Liens cohérents observés

* Réservation → contact.
* Réservation → candidature.
* Réservation → paiement.
* Réservation → document.
* Réservation → animal.
* Réservation → tableau de bord.
* Document → réservation.
* Document → paiement.
* Document → animal attribué via réservation.
* Paiement → réservation.
* Animal → réservation liée.
* Listes globales → fiches détail.

### Liens ou asymétries à surveiller

* Le groupe de portée n'a pas de route dédiée visible partout.
* Les notes internes de réservation n'ont pas de route propre ni de timeline transversale.
* Le dashboard pointe surtout vers les listes et les objets, pas vers une action précise de la fiche réservation.

## 10. Cohérence des statuts et libellés

### Cohérent

* Paiement `paid` est affiché comme `Payé`.
* Paiement `requested` est affiché comme `Demandé`.
* Réservation active n'est pas présentée comme finale.
* Animal attribué / non attribué est explicite sur la fiche réservation.
* La prochaine action est informative et non bloquante.

### À surveiller

* `documents.signed` peut être affiché `Signé` ou `Reçu signé` selon le type et l'appel au formatter.
* Les textes financiers restent parfois orientés arrhes 500 EUR, même si les parcours directs sont préservés.
* Le statut animal n'est pas modifié par l'attribution ; c'est volontaire, mais il faut éviter les libellés laissant croire que l'animal est adopté.

## 11. Risques techniques

* `src/app/reservations/[id]/page.tsx` concentre beaucoup de logique de données, calculs, UI et actions.
* Les calculs financiers existent dans la fiche réservation, la liste réservations et le dashboard.
* La logique documentaire est partagée par convention entre fiche réservation, fiche document, liste documents et dashboard, mais pas factorisée.
* Le dashboard et la prochaine action réservation peuvent diverger.
* Les actions revalident surtout les chemins immédiats ; les listes et dashboard sont cohérents au prochain chargement, mais pas forcément revalidés explicitement dans tous les cas.
* Les tests automatisés ciblés sur les actions RES-UX-3 à RES-UX-7 ne semblent pas encore consolidés dans une suite QA dédiée.

## 12. Checklist QA manuelle recommandée

1. Ouvrir une réservation avec paiement `requested`.
2. Cliquer `Marquer payé`.
3. Vérifier sur `/reservations/[id]` : paiement `Payé`, `paid_at`, montant payé et reste dû.
4. Vérifier sur `/payments` : statut `Payé`.
5. Vérifier sur `/payments/[id]` : statut `Payé` et date payée.
6. Vérifier sur `/` : paiement absent des paiements attendus.
7. Vérifier que le statut de réservation n'a pas changé.
8. Ouvrir une réservation avec document `to_generate`.
9. Cliquer `Marquer envoyé`.
10. Vérifier `/reservations/[id]`, `/documents`, `/documents/[id]` et dashboard.
11. Cliquer `Marquer reçu signé` sur un document `sent`.
12. Vérifier que le document est `Reçu signé` sur les fiches pertinentes.
13. Vérifier que le dashboard ne remonte plus le document signé.
14. Ajouter une note interne.
15. Vérifier qu'elle apparaît sur la fiche réservation et qu'elle reste interne.
16. Attribuer un animal disponible.
17. Vérifier `/reservations/[id]`, `/reservations`, `/animals/[id]` et `/documents/[id]` lié à la réservation.
18. Vérifier qu'aucun paiement, document, note, statut ou workflow n'a été modifié automatiquement.
19. Vérifier que les liens retour tableau de bord et listes globales restent présents.

## 13. Découpage recommandé des prochains lots

### QA-2 — Tests seed ciblés pour réservations

Objectif : créer ou formaliser des scénarios de test couvrant paiement demandé/payé, document envoyé/signé, note interne, animal attribué/non attribué.

Risque : moyen si le seed doit être enrichi ; faible si le lot reste à l'état de checklist ou tests non destructifs.

Pourquoi maintenant : stabiliser les comportements avant d'ajouter de nouvelles actions sensibles.

Exclusions : pas de migration, pas de workflow automatique, pas de génération documentaire.

### DASH-2 — Tableau de bord aligné avec nouveaux états réservation

Objectif : rapprocher les cartes dashboard des signaux désormais visibles dans la fiche réservation.

Risque : moyen, car le dashboard peut orienter le travail quotidien.

Pourquoi maintenant : éviter une divergence entre "prochaine action" de la fiche et "demandes d'attention" du dashboard.

Exclusions : pas de mutation, pas de statut automatique.

### ANIMAL-UX-1 — Fiche animal après attribution

Objectif : améliorer la lecture de la réservation liée depuis `/animals/[id]` après attribution.

Risque : faible à moyen si lecture seule.

Pourquoi plus tard : utile après validation que l'attribution est bien utilisée au quotidien.

Exclusions : pas de changement de statut animal, pas d'adoption automatique.

### RES-UX-9 — Refactor prudent de `/reservations/[id]`

Objectif : extraire helpers et petits blocs UI pour réduire le risque de régression.

Risque : moyen, car la page est centrale et volumineuse.

Pourquoi bientôt : la maintenabilité devient le risque principal.

Exclusions : pas de nouvelle fonctionnalité, pas de mutation, pas de changement métier.

### RES-PAY-1 — Cadrage demande complément arrhes 2/2

Objectif : cadrer l'action de complément d'arrhes pour préserver les parcours 2 x 250 EUR, 500 EUR direct et paiement intégral.

Risque : sensible, car touche le suivi financier.

Pourquoi plus tard : à traiter après tests QA pour éviter de rigidifier le workflow.

Exclusions : pas de Stripe, pas de facture, pas de déclenchement automatique.

### RES-HIST-1 — Historique / timeline réservation

Objectif : afficher notes, paiements, documents et événements dans une chronologie lisible.

Risque : moyen en lecture seule, plus sensible si ajout d'actions.

Pourquoi plus tard : utile pour comprendre les décisions passées, mais moins urgent que tests et dashboard.

Exclusions : pas de mutation au premier lot, pas d'automatisation.

## 14. Recommandation finale

La cohérence globale est bonne : les actions récentes sont manuelles, relisent les objets concernés, vérifient les liens de réservation/organisation et n'entraînent pas de changement automatique de statut ou workflow.

Ce qui doit être testé en priorité : propagation visuelle après `Marquer payé`, `Marquer envoyé`, `Marquer reçu signé`, ajout de note et attribution animal, notamment entre fiche réservation, listes globales, fiches détail et dashboard.

Ce qu'il faut éviter : ajouter une nouvelle action sensible avant d'avoir stabilisé les tests QA ou aligné le dashboard avec les nouveaux signaux réservation.

Prochaine brique recommandée : `QA-2 — Tests seed ciblés pour réservations`, puis `DASH-2` ou `RES-UX-9` selon la priorité entre pilotage quotidien et maintenabilité.

## 15. Exclusions respectées

* Aucun code applicatif modifié.
* Aucune UI modifiée.
* Aucune mutation serveur ajoutée.
* Aucune migration.
* Aucune modification RLS/RPC/policy.
* Aucune modification de seed.
* Aucune modification des types Supabase.
* Aucun paiement modifié.
* Aucun document modifié.
* Aucune note modifiée.
* Aucun animal modifié.
* Aucun statut ou workflow modifié.
* Aucune génération PDF/DOCX/HTML.
* Aucun upload.
* Aucun email.
* Aucune signature électronique.
* Aucune facture ou reçu.
* Aucune automatisation.

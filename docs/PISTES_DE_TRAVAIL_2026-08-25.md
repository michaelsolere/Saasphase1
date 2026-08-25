# Pistes de travail — août 2026

**Statut : pistes de travail, pas une feuille de route immuable.**
**Date : 25 août 2026** — établies à partir d'un bilan d'étape du dépôt (`docs/PROJECT_LOG.md`, référence parcours adoptant, audits, plans et prototypes).

Ce document propose un ordre de travail et des axes d'amélioration. Chaque piste reste à cadrer proportionnellement avant son lot, conformément à la méthode de travail d'`AGENTS.md`. Une décision explicite plus récente de l'utilisateur prime sur ce document.

---

## 1. Bilan d'étape (état vérifié au 25 août 2026)

### Parcours adoptant : complet

Les 9 lots de l'ordre de livraison validé (`docs/PARCOURS_ADOPTANT_WORKFLOW_REFERENCE.md`) sont livrés et fusionnés :

| # | Lot | État |
|---|-----|------|
| 1 | Candidats — tableau + panneau | ✅ #471 |
| 2 | Souhait temporel, invitation pré-réservation, premier versement | ✅ #472 |
| 3 | Parcours adoptants — timeline 7 jalons | ✅ #473 |
| 4 | Questionnaire accompagnement + revue changement par changement | ✅ #474/#475 |
| 5 | Positionnement post-naissance | ✅ #476–478 |
| 6 | Préparation guidée de la réservation | ✅ #479 |
| 7 | Rendez-vous de choix + attribution séquentielle | ✅ #480 |
| 8 | Organisation des départs | ✅ #481–486 |
| 9 | Chronologie unifiée | ✅ #487 |

Lots de polish ensuite : historique unifié de l'animal (#491), redesign fiche animal (#492), refonte détail Parcours adoptant Open 04 (#493), lisibilité courbes de croissance (#494).

### Volet élevage / portées : très avancé

Journal complet : sessions de mise-bas, naissances atomiques et express mobile, pesées collectives, courbes de croissance, comparaison inter-portées, planning J0–J60 paramétrable, observations maternelles + repère de température personnel, bilan de clôture, mode mobile PWA `/whelping`, réversibilité auditée de la première naissance.

### Socle transverse

Contacts uniques, candidatures, paiements (arrhes, complément, remboursements encadrés), documents (moteur PDF versionné, variantes, génération groupée, retours signés), Brevo transactionnel, suivi post-adoption T1/T2 automatisé.

### État du dépôt au moment du bilan

- Branche `fix/journal-followup-three-observations` avec ~770 lignes non commitées : refonte du Journal en onglets (`JOURNAL-UX-01`, prototype `sketches/004-journal-hybride`) + alertes de prise de poids paramétrables (`GAIN-ALERT-POLICY-01`).
- Typecheck vert ; tests purs 1046 passés (1 échec attendu hors stack E2E) ; lint rouge uniquement sur le fichier généré `supabase/.temp/start-secrets/...`.
- Dette suivie : 441 erreurs TypeScript historiques en E2E (surveillance active).

---

## 2. Trous identifiés (ce qui manque avant une utilisation complète)

1. **Accueil en retard sur le reste** : `/` est encore l'ancienne page de flux, alors qu'une vue « Aujourd'hui » existe ailleurs ; deux centres de pilotage concurrents.
2. **Fiche Contact sans vue 360°** : pas de chronologie unifiée côté contact comparable à celle du Parcours adoptant.
3. **Vues promises non livrées** (`comingSoon` dans la sidebar) : Parcours « À suivre » / « Finalisés », Portées « Passées », Remboursements/avoirs, Adoptants/Anciens/Partenaires, Documents archivés.
4. **Facture non implémentée** : décisions DOC-5K/5L à trancher (numérotation, TVA, statuts). L'attestation de vente existe déjà.
5. **Socialisation collective** : décision validée (« collective au niveau de la portée »), audit fait, rien d'implémenté.
6. **Migrations non appliquées à la stack personnelle** : plusieurs lots indiquent « à appliquer après fusion ». Inventaire et passage à faire.
7. Reportés à juste titre : offline-first mise-bas, Stripe, Google Agenda, dictée structurée.

---

## 3. Ordre de travail proposé

Chaque point est un lot borné : branche + PR, tests, cleanup fixtures vérifié.

| Ordre | Piste | Contenu |
|---|---|---|
| 0 | Clôture branche courante | Lint (exclure `supabase/.temp`), recette ciblée E2E onglets + alertes, cleanup fixtures, commit → PR → merge |
| 1 | Migrations stack perso | Inventaire, sauvegarde, application, vérification |
| 2 | HOME-TODAY | Accueil = file d'actions unique tous modules, cartes cliquables vers l'écran d'action pré-filtré |
| 3 | CONTACT-360 | Chronologie unifiée côté contact, accès direct aux dossiers liés |
| 4 | UX-FLOW | Dossier suivant/précédent depuis le panneau, raccourcis clavier, recherche globale Cmd+K, badges sidebar chiffrés, états vides orientés action |
| 5 | Vues manquantes | « Finalisés » / « À suivre » du Parcours, Portées « Passées », Remboursements/avoirs |
| 6 | SOCIALIZATION-01 | Planning de socialisation collectif par portée |
| 7 | FACTURE-01 | Cadrage DOC-5L avec l'utilisateur, puis implémentation |

Après le point 5, l'application est utilisable au quotidien de manière complète. Les points 6–7 complètent. Stripe/offline/Agenda restent hors route jusqu'à besoin démontré.

---

## 4. Pistes UX/UI

### À préserver (grammaire existante qui fonctionne)
Tableau compact + panneau confortable · timeline 7 jalons · prochaine action calculée · divulgation progressive · chronologie unifiée · confirmation guidée réservée aux décisions sensibles.

### Fort impact
1. Accueil = file d'actions unique ; chaque carte ouvre directement l'écran d'action.
2. Traitement en série des dossiers : ← Précédent / Suivant → depuis le panneau (compteur « 4/12 »), filtres/tri/scroll conservés.
3. Recherche globale Cmd+K (familles, portées, animaux).
4. Badges chiffrés dans la sidebar (soumissions, paiements attendus, tâches du jour).

### Impact moyen
5. Actions terminées en un clic depuis les listes là où c'est sûr ; confirmation guidée uniquement pour le sensible.
6. États vides qui proposent l'action (« Partager le formulaire public » avec copie de lien).
7. Retour visible après chaque mutation (toast cohérent, action d'annulation quand possible).
8. Mode téléphone « éleveur pressé » : consultation + actions urgentes seulement.

### Finitions UI
9. Harmoniser densité/typo entre les écrans récemment refondus (#492, #493, Journal en onglets) et les plus anciens (contacts, paiements, documents).
10. Standardiser libellés d'état et couleurs sémantiques via tokens partagés.
11. Nettoyer les routes QA résiduelles (`/qa-adopter-workbench`, `/qa-post-adoption-preview`, `/__qa`) pour l'usage normal.

---

## 5. Décisions attendues de l'utilisateur avant certains lots

- **FACTURE-01** : décisions DOC-5L (facture unique vs arrhes/solde, moment d'émission, numérotation, statuts, TVA selon régime réel de l'élevage).
- **HOME-TODAY** : contenu exact de la file d'actions et priorités affichées.
- **UX-FLOW** : périmètre exact des raccourcis clavier et de la recherche globale.

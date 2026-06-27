# RES-UX-1 — Audit fiche réservation comme centre du dossier adoptant

Date : 2026-06-27

## 1. Résumé exécutif

La fiche `/reservations/[id]` est déjà le point le plus opérationnel du dossier adoptant. Elle centralise la réservation, le contact, la candidature liée, la portée ou le groupe, l'animal attribué, les paiements, les documents, les notes, les événements, les actions de statut, les actions de paiement, les actions documentaires et l'attribution d'un animal.

Cette richesse confirme la bonne direction métier : la Réservation est le centre de pilotage concret, tandis que le Contact reste la mémoire relationnelle et la Candidature le projet d'adoption.

Le principal enjeu n'est pas l'absence de données, mais la lisibilité et le niveau de risque. La page mélange aujourd'hui des blocs de lecture, des diagnostics, des résumés, des formulaires de mutation et des actions sensibles dans un seul fichier de 2265 lignes. Les prochains lots doivent donc commencer par renforcer la lecture seule et l'organisation de l'information avant d'ajouter ou déplacer des actions.

Recommandation : lancer d'abord `RES-UX-2` pour améliorer la fiche en lecture seule, sans mutation, puis traiter les notes internes, les prochaines actions et les actions sensibles par lots séparés.

## 2. Fichiers inspectés

- `AGENTS.md`
- `README.md`
- `docs/PROJECT_LOG.md`
- `src/app/reservations/[id]/page.tsx`
- `src/app/reservations/page.tsx`
- `src/features/reservations/actions.ts`
- `src/features/reservations/formatters.ts`
- `src/features/reservations/statuses.ts`
- `src/features/reservations/types.ts`
- `src/features/reservations/reservation-list.tsx`
- `src/features/payments/actions.ts`
- `src/features/payments/reservation-payment-form.tsx`
- `src/features/payments/reservation-refund-form.tsx`
- `src/features/payments/formatters.ts`
- `src/features/documents/actions.ts`
- `src/features/documents/formatters.ts`
- `src/types/database.types.ts`
- `supabase/migrations/202606220003_workflow_indexes_views_rls.sql`

## 3. Structure actuelle de la fiche réservation

### Résumé haut de fiche

Présent. Le haut de page affiche :

- les liens de navigation vers tableau de bord, liste réservations, candidatures et contacts ;
- un titre centré sur le contact ;
- un résumé du dossier adoptant ;
- l'adoptant ;
- le statut ;
- la portée ou le groupe ;
- l'animal attribué ;
- un résumé paiements / arrhes ;
- un résumé documents ;
- une prochaine action suggérée.

Ce résumé est utile et cohérent avec la philosophie "réservation = centre opérationnel". Il peut cependant devenir plus précis pour les parcours directs, car certaines règles restent orientées vers le scénario pré-réservation 2 x 250 EUR.

### Contact / adoptant

Présent. La fiche affiche le nom du contact et propose un lien vers `/contacts/[id]` dans le résumé et dans l'encart latéral.

Limite : la fiche n'affiche pas les coordonnées complètes du contact dans cette page. Pour piloter un dossier, l'éleveur doit ouvrir la fiche contact pour retrouver email, téléphone ou adresse.

### Candidature

Partiellement présent. La fiche affiche un lien vers `/candidatures/[id]` si une candidature est liée.

Limite : les informations métier de candidature ne sont pas visibles directement sur la réservation : projet, sexe souhaité détaillé, commentaires de qualification, portée souhaitée initiale, date de candidature.

### Portée ou groupe

Présent. La page affiche la portée, le groupe de portée, les rangs initial/actif et un lien vers la portée si `litter_id` existe.

Limite : le groupe de portée n'a pas de lien dédié visible. La page distingue portée précise et groupe, mais le contexte portée reste plus consultatif qu'opérationnel.

### Animal

Présent. La fiche affiche l'animal attribué, son statut, son sexe, sa date de naissance, son identification et sa couleur/robe si disponibles. Elle propose aussi une attribution ou un retrait d'attribution tant que la réservation n'est pas finale.

Limite : l'attribution animal est une action sensible placée dans la même page que les blocs de lecture. Elle est utile, mais devrait rester très explicitement cadrée.

### Statut

Présent. La fiche affiche le statut et propose certaines transitions :

- confirmer une réservation `draft` ;
- finaliser l'adoption depuis `active` ;
- annuler, désister ou expirer depuis `active` ;
- demander le complément d'arrhes depuis `pre_reservation_paid`.

Limite : plusieurs statuts existent dans les libellés (`confirmed_after_birth`, `animal_assigned`, `adoption_ready`, etc.), mais les actions visibles couvrent surtout `draft`, `active` et `pre_reservation_paid`. Le modèle de statuts est donc plus large que l'interface actuelle.

### Paiements

Présent et actionnable. La page affiche un résumé financier, les paiements liés, le reste à régler ou trop-perçu, et propose :

- un formulaire de paiement manuel ;
- un formulaire de remboursement ;
- la demande manuelle du complément d'arrhes 250 EUR dans le parcours de pré-réservation.

Limite : la synthèse affiche bien "arrhes complètes" si 500 EUR sont payés, même en une fois, mais certaines actions et textes restent formulés autour du complément 2/2 de 250 EUR.

### Documents

Présent et actionnable. La page affiche les documents liés, leur statut, leur type, les dates d'envoi/signature/réception, le fichier éventuel, le besoin de signature et le lien vers `/documents/[id]`. Pour `commitment_certificate` et `reservation_contract`, elle permet de marquer comme envoyé puis reçu signé. Elle peut aussi initialiser ces deux documents après premier paiement d'arrhes dans le parcours prévu.

Limite : la fiche ne présente pas encore une vue "documents attendus vs documents présents" indépendante du parcours 2 x 250 EUR. L'attestation de vente `sale_certificate` est cadrée et prévisualisée côté document, mais n'est pas encore intégrée comme document attendu dans la réservation.

### Notes

Présent en lecture seule. La page charge et affiche les notes liées à la réservation avec titre, corps, type, visibilité, date et auteur.

Limite : pas de création de note depuis la fiche réservation. Le commentaire interne de réservation existe, mais il ne remplace pas un historique daté.

### Historique / événements

Présent en lecture seule. La page affiche :

- les événements liés à la réservation ;
- les événements de suivi post-adoption si le statut est `adopted`.

Limite : pas de timeline unifiée, pas d'action d'ajout, et distinction encore dispersée entre notes, événements, paiements et documents.

## 4. Données chargées par `/reservations/[id]`

| Objet | Source actuelle | Disponible | Affiché | Lien de navigation | Remarques |
| --- | --- | --- | --- | --- | --- |
| Réservation | `reservation_overview` + `reservations` | Oui | Oui | Page courante | Vue pour les champs principaux, table directe pour commentaire interne et échéance de pré-réservation. |
| Organisation | Indirectement via `organization_id` | Partiel | Non | Non | L'organisation sert au filtrage, mais l'identité vendeur n'est pas affichée sur la fiche réservation. |
| Contact | `reservation_overview.contact_*` | Partiel | Oui | Oui | Nom affiché et lien. Coordonnées non affichées. |
| Candidature | `reservation_overview.application_id` | Partiel | Lien seul | Oui | Pas de détail de candidature dans la fiche. |
| Portée | `reservation_overview.litter_*` | Partiel | Oui | Oui si `litter_id` | Nom et lien, mais pas parents ni dates de portée. |
| Groupe de portée | `reservation_overview.litter_group_*` | Partiel | Oui | Non | Nom affiché, pas de route dédiée visible dans la fiche. |
| Animal attribué | `reservation_overview` + `animals` | Oui si lié | Oui | Oui | Détails utiles affichés. |
| Animaux disponibles | `animals` + réservations actives | Oui si aucun animal lié | Oui | Non | Sert au formulaire d'attribution. |
| Paiements | `payments` + agrégats de `reservation_overview` | Oui | Oui | Oui vers `/payments/[id]` | Liste détaillée et synthèse financière. |
| Documents | `documents` | Oui | Oui | Oui vers `/documents/[id]` | Actions sur certificat et contrat de réservation. |
| Notes | `notes` + `profiles` auteur | Oui | Oui | Non | Lecture seule. |
| Événements | `events` | Oui | Oui | Non | Lecture seule, séparés entre post-adoption et événements généraux. |
| Historique complet | Non unifié | Partiel | Partiel | Non | Notes, événements, paiements, documents restent séparés. |

## 5. Paiements dans la fiche réservation

### Ce qui est déjà clair

- Le prix total convenu est visible et modifiable.
- Le montant payé est visible via `paid_cents`.
- Le montant remboursé est pris en compte via `refunded_cents`.
- Le reste à régler, le soldé et le trop-perçu sont calculés.
- Les paiements liés sont listés avec montant, statut, type, méthode, date et note.
- Les paiements sont cliquables vers `/payments/[id]`.
- Le formulaire manuel peut enregistrer des arrhes ou un solde, en statut payé ou demandé.
- Le formulaire de remboursement est séparé et explicite.
- Le formulaire de paiement ne change pas automatiquement le statut de réservation.

### Points à améliorer

- La logique de résumé `arrhes complètes` utilise correctement le seuil de 500 EUR, mais les textes et actions restent encore très liés au parcours 2 x 250 EUR.
- La demande de complément d'arrhes est strictement un deuxième paiement de 250 EUR sur `pre_reservation_paid`.
- La fiche ne distingue pas encore clairement les trois parcours dans son résumé :
  - pré-réservation 2 x 250 EUR ;
  - réservation directe avec 500 EUR d'arrhes en une fois ;
  - paiement intégral sans arrhes séparées.
- Le paiement intégral est seulement inféré par `paid_cents - refunded_cents >= price_cents`.
- Les notions d'avoir, report, retenue, remboursement partiel ou résolution financière existent comme principes/projets, mais ne sont pas encore pleinement pilotées depuis la fiche.
- La mise à jour d'un paiement demandé en "payé" existe côté paiement (`markPaymentAsPaid`) mais n'est pas proposée directement depuis la fiche réservation.

### Point d'attention métier

Les prochains lots ne doivent pas rendre obligatoire le scénario 2 x 250 EUR. Les paiements doivent rester des événements financiers liés au dossier, pas un workflow unique imposé.

## 6. Documents dans la fiche réservation

### Ce qui est déjà clair

- Les documents liés sont visibles dans la fiche réservation.
- Chaque document affiche :
  - titre ;
  - statut ;
  - type ;
  - dates d'envoi, signature, réception ou création ;
  - nom de fichier éventuel ;
  - signature requise ;
  - lien vers `/documents/[id]`.
- Les documents `commitment_certificate` et `reservation_contract` peuvent être marqués :
  - `to_generate` -> `sent` ;
  - `sent` -> `signed`.
- L'initialisation des documents de réservation crée les deux documents attendus si le premier paiement d'arrhes est payé.

### Points à améliorer

- La fiche ne montre pas encore explicitement une checklist de documents attendus indépendante des documents déjà créés.
- Le certificat d'engagement, le contrat de réservation et l'attestation de vente ne sont pas encore présentés comme une séquence documentaire complète du dossier adoptant.
- L'attestation de vente est hors checklist réservation pour le moment.
- Le respect indicatif des 7 jours du certificat d'engagement est mieux cadré côté `/documents/[id]` que côté réservation.
- Les actions documentaires restent limitées à l'envoi et au reçu signé, sans génération réelle ni upload.

### Cohérence avec les lots DOC récents

La fiche document est maintenant l'endroit de diagnostic documentaire détaillé. La fiche réservation devrait plutôt afficher un suivi synthétique :

- document attendu ;
- document présent ou absent ;
- statut ;
- prochaine étape ;
- lien vers le détail document.

## 7. Notes et historique

### Notes

La fiche affiche les notes liées à la réservation. Chaque note indique son contenu, son type, sa visibilité, sa date et son auteur.

Manque principal : il n'existe pas encore d'action "Ajouter une note" depuis la réservation.

### Commentaire interne

La fiche permet de modifier un `internal_comment` directement sur la réservation. C'est utile pour un résumé, mais ce champ ne constitue pas un historique daté.

### Événements

La fiche affiche les événements liés à la réservation et, pour une adoption finalisée, les événements de suivi post-adoption.

Manque principal : il n'existe pas encore de timeline unifiée mélangeant notes, paiements, documents et changements de statut.

## 8. Actions rapides potentielles

| Action future | Intérêt métier | Risque | Mutation serveur | Changement statut | Migration | Lot recommandé |
| --- | --- | --- | --- | --- | --- | --- |
| Ouvrir fiche contact | Navigation immédiate | Simple | Non | Non | Non | RES-UX-2 |
| Ouvrir candidature | Navigation immédiate | Simple | Non | Non | Non | RES-UX-2 |
| Ouvrir documents | Navigation immédiate | Simple | Non | Non | Non | RES-UX-2 |
| Ouvrir animal | Navigation immédiate | Simple | Non | Non | Non | RES-UX-2 |
| Ajouter une note interne | Tracer une décision ou un échange | Moyen | Oui | Non | Non si `notes` suffit | RES-UX-3 |
| Voir une timeline dossier | Compréhension rapide du passé | Moyen | Non au départ | Non | Non si lecture seule | RES-UX-3 ou RES-UX-4 |
| Améliorer prochaine action | Pilotage quotidien | Moyen | Non au départ | Non | Non | RES-UX-4 |
| Initialiser documents attendus | Préparer certificat + contrat | Moyen | Oui | Non | Non | Déjà présent, à clarifier dans RES-UX-5 |
| Marquer document envoyé | Suivi documentaire | Moyen | Oui | Non | Non | Déjà présent, à consolider RES-UX-5 |
| Marquer document reçu signé | Suivi documentaire | Moyen | Oui | Non | Non | Déjà présent, à consolider RES-UX-5 |
| Vérifier documents attendus | Réduire oublis | Moyen | Non ou Oui selon option | Non | Non | RES-UX-5 |
| Marquer paiement demandé comme payé | Suivi financier | Sensible | Oui | Peut déclencher statut via paiement 250 EUR | Non | RES-UX-6 |
| Demander complément d'arrhes | Parcours pré-réservation | Sensible | Oui | Non | Non | Déjà présent, à isoler RES-UX-6 |
| Enregistrer paiement manuel | Encaisser arrhes/solde | Sensible | Oui | Non | Non | Déjà présent, à revoir RES-UX-6 |
| Enregistrer remboursement | Gestion financière | Sensible | Oui | Non | Non | Déjà présent, à revoir RES-UX-6 |
| Attribuer un animal | Passage à un dossier concret | Sensible | Oui | Non actuellement | Non | Déjà présent, à consolider RES-UX-7 |
| Retirer attribution animal | Correction dossier | Sensible | Oui | Non | Non | Déjà présent, à consolider RES-UX-7 |
| Changer portée ou groupe | Repositionnement dossier | Sensible | Oui | Potentiel | Non | RES-UX-7 ou lot dédié |
| Reporter réservation | Gestion désistement/report | Sensible | Oui | Oui ou champ dédié | À confirmer | Lot dédié |
| Enregistrer désistement | Sortie dossier | Sensible | Oui | Oui | Non | Déjà présent, à garder séparé |
| Transformer en avoir | Résolution financière | Sensible | Oui | Potentiel | À confirmer | Lot dédié Finance/RES |

## 9. Prochaine action indicative

### État actuel

La fiche calcule une prochaine action textuelle à partir :

- du statut de réservation ;
- du montant payé ;
- de la présence de paiements d'arrhes 250 EUR ;
- de la présence des documents ;
- du statut des documents ;
- de la présence ou non d'un animal attribué.

Les messages couvrent notamment :

- attente du premier paiement 1/2 ;
- confirmation de pré-réservation après premier versement ;
- demande du complément 250 EUR ;
- attente du complément demandé ;
- initialisation des documents ;
- documents à envoyer ;
- attente de signature ;
- attribution animal ;
- adoption finalisée ;
- statut final.

### Limites

- La logique reste majoritairement organisée autour de `pre_reservation_requested` puis `pre_reservation_paid`.
- Elle ne couvre pas finement la réservation directe avec 500 EUR d'arrhes en une fois.
- Elle ne couvre pas explicitement le paiement intégral sans arrhes séparées.
- Elle ne distingue pas assez :
  - documents manquants ;
  - paiement attendu ;
  - animal non attribué ;
  - date de cession/adoption absente ;
  - certificat d'engagement non signé.
- Elle ne s'appuie pas encore sur les nouveaux aperçus documentaires récents.

### Recommandation

Créer plus tard une checklist informative et non bloquante, séparée des mutations :

- "Financier" ;
- "Documents" ;
- "Animal" ;
- "Cession/adoption" ;
- "Suivi".

Cette checklist doit rester compatible avec les trois parcours financiers.

## 10. Navigation et liens métier

| Destination | Présent | Remarque |
| --- | --- | --- |
| Tableau de bord `/` | Oui | Lien haut de page. |
| Liste réservations `/reservations` | Oui | Lien haut de page. |
| Contact `/contacts/[id]` | Oui | Résumé et aside. |
| Candidature `/candidatures/[id]` | Oui | Aside uniquement. |
| Document `/documents/[id]` | Oui | Liste documents liés. |
| Paiement `/payments/[id]` | Oui | Liste paiements liés. |
| Portée `/litters/[id]` | Oui si portée précise | Pas de lien groupe. |
| Animal `/animals/[id]` | Oui si animal attribué | Résumé et bloc animal. |
| Liste documents `/documents` | Non direct depuis la fiche | Accessible par navigation globale ailleurs. |
| Liste paiements `/payments` | Non direct depuis la fiche | Les paiements individuels sont cliquables. |

Liens manquants ou à renforcer :

- lien plus visible vers la candidature dans le résumé haut ;
- lien vers la liste documents filtrée ou section documents de la fiche ;
- lien vers la liste paiements filtrée ou section paiements de la fiche ;
- lien vers le groupe de portée si une route existe plus tard ;
- ancres internes possibles vers Paiements, Documents, Notes, Animal.

## 11. Lisibilité UX

### Forces

- La fiche est complète.
- Les blocs importants existent déjà.
- Les objets métier nommés sont globalement cliquables.
- Les messages de mutation rappellent souvent ce qui n'est pas automatisé.
- Les états vides sont présents.
- Le retour tableau de bord est présent.

### Faiblesses

- La page est longue et mélange lecture, modification et actions sensibles.
- Les actions de statut, paiements, documents et animal peuvent détourner l'attention de la lecture du dossier.
- Le résumé haut donne une bonne première lecture, mais ne suffit pas encore à comprendre le dossier en 10 secondes.
- La candidature et les coordonnées adoptant sont trop peu visibles sur la fiche.
- Les paiements sont détaillés, mais le parcours financier n'est pas formulé de manière neutre pour les trois scénarios.
- Les notes et événements sont présents mais séparés, sans timeline commune.
- Les sections de mutation pourraient être regroupées ou visuellement isolées dans de futurs lots.

### Organisation cible proposée

1. Bandeau de synthèse :
   - adoptant ;
   - statut ;
   - parcours financier détecté ou "à qualifier" ;
   - animal ;
   - documents clés ;
   - prochaine action informative.
2. Bloc "Dossier adoptant" :
   - contact ;
   - candidature ;
   - coordonnées essentielles ;
   - liens.
3. Bloc "Réservation" :
   - statut ;
   - portée/groupe ;
   - sexe souhaité ;
   - dates ;
   - rangs ;
   - commentaire interne.
4. Bloc "Financier" :
   - prix ;
   - payé ;
   - remboursé ;
   - reste dû ;
   - paiements liés.
5. Bloc "Documents" :
   - certificat ;
   - contrat ;
   - attestation plus tard ;
   - états et liens.
6. Bloc "Animal" :
   - animal attribué ;
   - données clés ;
   - attribution si action autorisée.
7. Bloc "Historique" :
   - notes ;
   - événements ;
   - changements importants.
8. Bloc "Actions" :
   - séparé, lisible, avec garde-fous.

## 12. Risques techniques

- `src/app/reservations/[id]/page.tsx` est très volumineux : 2265 lignes.
- La page cumule chargement de données, calculs, affichage, messages de retour et formulaires d'action.
- Plusieurs calculs financiers sont faits localement alors que les agrégats viennent déjà de `reservation_overview`.
- Certaines règles métier sont dupliquées entre pages paiements, documents et réservation.
- Les actions sensibles sont nombreuses dans une seule vue.
- Les mutations reposent fortement sur les RLS et relectures serveur ; les prochains lots doivent préserver ces garde-fous.
- Le découpage en composants devra rester prudent pour ne pas changer le rendu ou les données chargées.
- Les statuts disponibles dépassent les statuts vraiment pilotés par l'UI actuelle.
- Les documents récents côté `/documents/[id]` créent un risque de duplication si la fiche réservation tente de refaire tous les diagnostics documentaires.

## 13. Découpage recommandé des prochains lots

### RES-UX-2 — Amélioration lecture seule de la fiche réservation

Objectif :

- améliorer la compréhension en 10 secondes ;
- renforcer le résumé haut ;
- rendre contact, candidature, paiements, documents et animal plus lisibles ;
- ajouter des liens/ancres simples ;
- ne créer aucune mutation.

Fichiers probablement concernés :

- `src/app/reservations/[id]/page.tsx`
- éventuellement petits composants locaux si nécessaire.

Risque : simple à moyen.

Validation nécessaire :

- vérifier visuellement au moins une réservation avec paiements/documents ;
- `pnpm lint`, `pnpm build`, `git diff --check`.

Exclusions :

- pas de nouvelle action ;
- pas de modification paiements/documents/statuts ;
- pas de migration.

### RES-UX-3 — Notes internes réservation

Objectif :

- permettre d'ajouter une note interne liée à la réservation ;
- conserver l'historique daté ;
- distinguer commentaire synthétique et notes.

Fichiers probablement concernés :

- `src/app/reservations/[id]/page.tsx`
- action serveur notes existante ou nouvelle action dans un périmètre notes/réservations.

Risque : moyen.

Validation nécessaire :

- vérifier RLS notes ;
- vérifier création note liée à `reservation_id` et `organization_id`.

Exclusions :

- pas de workflow automatique ;
- pas de modification de statut ;
- pas de refonte timeline globale si le lot reste minimal.

### RES-UX-4 — Prochaine action améliorée et checklist informative

Objectif :

- remplacer ou compléter la prochaine action unique par une checklist informative ;
- couvrir les trois parcours financiers ;
- distinguer financier, documents, animal, cession/adoption ;
- rester non bloquant.

Fichiers probablement concernés :

- `src/app/reservations/[id]/page.tsx`
- éventuellement helper local de diagnostic.

Risque : moyen.

Validation nécessaire :

- tester pré-réservation 2 x 250 EUR ;
- tester 500 EUR direct ;
- tester paiement intégral ;
- tester absence d'animal/documents.

Exclusions :

- aucune mutation ;
- aucune règle juridique bloquante ;
- aucun changement de statut.

### RES-UX-5 — Actions documents depuis réservation

Objectif :

- clarifier les documents attendus ;
- mieux présenter certificat, contrat et attestation ;
- conserver les actions existantes envoyé/reçu signé avec garde-fous ;
- éviter de dupliquer les aperçus détaillés de `/documents/[id]`.

Fichiers probablement concernés :

- `src/app/reservations/[id]/page.tsx`
- `src/features/documents/actions.ts` si ajustement d'action validé.

Risque : moyen à sensible.

Validation nécessaire :

- vérifier transitions `to_generate -> sent -> signed` ;
- vérifier qu'aucune génération réelle n'est introduite ;
- vérifier compatibilité des types documentaires.

Exclusions :

- pas de PDF/DOCX/HTML ;
- pas d'email ;
- pas de signature électronique ;
- pas de template définitif.

### RES-UX-6 — Actions paiements depuis réservation

Objectif :

- clarifier paiement demandé, paiement payé, arrhes, solde, remboursement ;
- éventuellement permettre de marquer un paiement demandé comme payé depuis la fiche ;
- conserver la compatibilité des trois parcours.

Fichiers probablement concernés :

- `src/app/reservations/[id]/page.tsx`
- `src/features/payments/actions.ts`
- `src/features/payments/reservation-payment-form.tsx`
- `src/features/payments/reservation-refund-form.tsx`.

Risque : sensible.

Validation nécessaire :

- tester paiement demandé -> payé ;
- vérifier impact sur `pre_reservation_requested -> pre_reservation_paid` ;
- tester remboursement/trop-perçu ;
- vérifier absence de facture.

Exclusions :

- pas de Stripe ;
- pas de facture ;
- pas d'automatisation ;
- pas de changement de modèle.

### RES-UX-7 — Attribution animal et sortie adoption

Objectif :

- consolider l'attribution animal ;
- clarifier les conditions d'attribution/retrait ;
- mieux préparer la transition vers adoption/cession.

Fichiers probablement concernés :

- `src/app/reservations/[id]/page.tsx`
- `src/features/reservations/actions.ts`.

Risque : sensible.

Validation nécessaire :

- tester animal disponible ;
- tester animal déjà attribué ;
- tester statut final ;
- vérifier que l'adoption ne modifie pas involontairement les paiements/documents.

Exclusions :

- pas d'attestation réelle ;
- pas de facture ;
- pas de modification des statuts sans cadrage.

## 14. Recommandation finale

Faire en premier `RES-UX-2`, en lecture seule. C'est le meilleur rapport valeur/risque : la fiche réservation contient déjà les données, mais elles doivent être mieux hiérarchisées pour devenir le cockpit du dossier adoptant.

À éviter pour le prochain lot :

- ajouter de nouvelles mutations avant d'avoir clarifié la lecture ;
- renforcer le parcours 2 x 250 EUR comme s'il était obligatoire ;
- déplacer des règles sensibles de paiement ou de document sans cadrage ;
- dupliquer dans la réservation tous les aperçus documentaires déjà présents côté `/documents/[id]`.

À garder manuel pour l'instant :

- demande du complément d'arrhes ;
- attribution animal ;
- finalisation adoption ;
- remboursements ;
- sortie désistement/annulation/expiration ;
- tout ce qui touche facture, attestation réelle ou génération documentaire.

Ce qui peut être confié à Codex en autonomie :

- amélioration lecture seule ;
- liens et ancres ;
- réorganisation visuelle prudente ;
- diagnostics informatifs non bloquants ;
- extraction de petits helpers/UI locaux si nécessaire.

Ce qui doit rester cadré avant implémentation :

- actions financières ;
- changements de statut ;
- attribution/retrait animal ;
- création de notes si les règles de visibilité doivent évoluer ;
- intégration future d'attestation/facture.

## 15. Exclusions respectées pour RES-UX-1

- Aucun code applicatif modifié.
- Aucune modification UI.
- Aucune mutation serveur ajoutée.
- Aucune migration créée.
- Aucune RLS/RPC/policy modifiée.
- Aucun seed modifié.
- Aucun type Supabase modifié.
- Aucune génération PDF/DOCX/HTML.
- Aucun upload.
- Aucun email.
- Aucune signature électronique.
- Aucun paiement modifié.
- Aucun statut modifié.
- Aucun workflow modifié.

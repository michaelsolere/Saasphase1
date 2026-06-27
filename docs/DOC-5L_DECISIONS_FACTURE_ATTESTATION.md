# DOC-5L — Décisions métier facture / attestation

Date : 2026-06-27

## 1. Synthèse exécutive

Les audits DOC-5J et DOC-5K montrent que l'attestation de vente et la facture sont liées au même moment métier, mais ne doivent pas être traitées de la même manière.

L'attestation de vente est un document métier de cession. Elle sert à formaliser le transfert d'un animal identifié entre le vendeur et l'adoptant, en rappelant la réservation, le certificat d'engagement, les documents remis, la date de cession et les informations de l'animal. Elle peut être prototypée comme aperçu interne documentaire, sans génération réelle, à condition de rester clairement indicative.

La facture est un document comptable et fiscal. Elle nécessite une numérotation stable, des statuts stricts, une conservation après émission, des données vendeur/client figées, et potentiellement des montants HT/TVA/TTC selon le régime de l'élevage. Elle ne doit pas être seulement une ligne `documents` ou un aperçu documentaire enrichi.

Les décisions bloquantes avant un prototype facture sont : facture finale unique ou factures d'arrhes/solde, moment d'émission, numérotation, statut brouillon/émise/annulée/avoir, règles d'immutabilité, TVA/mentions fiscales, et liens avec paiements/avoir. Les décisions qui peuvent attendre concernent surtout la génération PDF, l'envoi, la signature, le stockage, et les textes définitifs de mise en page.

Recommandation générale : prototyper d'abord l'attestation de vente comme aperçu interne non généré, puis cadrer techniquement le modèle facture avant tout prototype de facture, sauf si Michael valide explicitement une facture brouillon non fiscale et non numérotée.

## 2. Distinction attestation de vente / facture

### Attestation de vente

Nature : document métier de cession.

Elle est centrée sur :

- l'animal vendu ou cédé ;
- l'adoptant ;
- le vendeur / élevage ;
- la date de cession ou de départ ;
- le certificat d'engagement ;
- le contrat de réservation ;
- les documents remis ;
- les informations utiles à la traçabilité de la cession.

Elle peut être prototypée comme aperçu interne documentaire avant toute génération réelle. Elle peut utiliser les données déjà exposées dans `/documents/[id]`, en restant non juridique définitive, non exportable et non signable.

### Facture

Nature : document comptable et fiscal.

Elle nécessite :

- une numérotation stable ;
- une séquence par organisation, surtout en futur SaaS multi-élevages ;
- un statut distinct : brouillon, émise, annulée, avoir ;
- une conservation après émission ;
- une absence de suppression après émission ;
- des snapshots vendeur/client ;
- des lignes de facture ;
- des liens explicites avec réservation, animal, paiements et avoirs ;
- une validation du régime fiscal : HT/TVA/TTC, franchise, mentions obligatoires.

Conclusion : `documents.document_type = 'invoice'` peut servir de représentation documentaire plus tard, mais ne suffit pas comme modèle de facture réelle.

## 3. Décisions métier recommandées — Attestation de vente

### Moment de préparation

Décision proposée : préparer l'attestation seulement quand une réservation existe et qu'un animal est attribué.

Justification : l'attestation porte sur une cession d'animal précis. Avant attribution, les données ressemblent davantage au contrat de réservation.

Impact technique futur : l'aperçu interne peut être conditionné par `reservation_id` et `animal_id`, sans bloquer la page si des données manquent.

Point à valider par Michael : accepter que l'attestation ne soit pas préparée avant attribution.

### Moment de finalisation

Décision proposée : finaliser l'attestation quand la date de cession/départ est connue, l'identification disponible, et les documents obligatoires vérifiés.

Justification : le document final doit refléter la réalité au départ de l'animal.

Impact technique futur : diagnostic sur `adoption_planned_at` / `adoption_completed_at`, identification, certificat d'engagement, contrat de réservation et documents remis.

Point à valider par Michael : confirmer si `adoption_completed_at` représente la date juridique de cession, ou si une future date dédiée sera nécessaire.

### Données obligatoires

Décision proposée : rendre obligatoires pour une attestation finale :

- vendeur / organisation ;
- adoptant ;
- réservation ;
- animal attribué ;
- espèce ;
- race ;
- sexe ;
- date de naissance si connue ;
- identification ;
- date de cession ;
- signataire / représentant ;
- qualité du signataire.

Justification : ces données définissent les parties, l'objet et la date de la cession.

Impact technique futur : diagnostics bloquants seulement au moment d'une future finalisation, pas dans un prototype interne.

Point à valider par Michael : confirmer si l'identification doit toujours être obligatoire avant remise.

### Données recommandées

Décision proposée : afficher comme recommandées :

- LOF ;
- couleur / collier ;
- portée ;
- mère ;
- père ;
- certificat vétérinaire ;
- documents remis ;
- certificat d'engagement signé ;
- contrat de réservation signé ;
- paiement final / solde.

Justification : ces informations renforcent la traçabilité, mais certaines peuvent dépendre du contexte.

Impact technique futur : points d'attention informatifs.

Point à valider par Michael : choisir ce qui est strictement obligatoire dans sa pratique.

### Animal attribué

Décision proposée : animal attribué obligatoire pour finaliser, mais le prototype peut afficher un état "animal non attribué" sans erreur technique.

Justification : il ne peut pas y avoir attestation de cession sans animal identifié.

Impact technique futur : condition de finalisation, pas condition de consultation.

Point à valider par Michael : oui/non.

### Identification

Décision proposée : identification obligatoire avant attestation finale.

Justification : elle permet d'identifier juridiquement l'animal cédé.

Impact technique futur : diagnostic sur `animals.identification_number`.

Point à valider par Michael : confirmer selon les obligations applicables.

### Lien avec réservation

Décision proposée : attestation liée obligatoirement à une réservation, avec `animal_id` également renseigné.

Justification : la réservation centralise l'adoptant, le prix, les paiements, les documents et l'animal attribué.

Impact technique futur : relation principale `reservation_id`, relation animal explicite pour robustesse.

Point à valider par Michael : confirmer que toutes les cessions passent par une réservation, même en vente directe.

### Lien avec certificat d'engagement

Décision proposée : afficher et diagnostiquer le certificat d'engagement lié, avec date d'envoi/signature et rappel informatif du délai de 7 jours.

Justification : ce certificat est préalable à la cession.

Impact technique futur : recherche des documents `commitment_certificate` liés à la réservation/contact/animal.

Point à valider par Michael : quelle date fait foi si plusieurs certificats existent.

### Lien avec contrat de réservation

Décision proposée : afficher le contrat de réservation lié s'il existe, sans le rendre obligatoire pour les ventes directes si Michael confirme ce parcours.

Justification : le parcours C peut être une vente/adoption directe sans réservation classique en deux étapes.

Impact technique futur : diagnostic informatif, non bloquant par défaut.

Point à valider par Michael : contrat de réservation toujours requis ou non.

### Lien avec facture

Décision proposée : ne pas rendre la facture obligatoire pour prototyper l'attestation interne, mais prévoir un lien futur attestation -> facture.

Justification : l'attestation peut avancer comme document métier, alors que la facture demande des décisions comptables.

Impact technique futur : champ ou relation future à cadrer après modèle facture.

Point à valider par Michael : l'attestation finale doit-elle mentionner un numéro de facture.

### Documents remis

Décision proposée : prévoir une liste de documents remis, d'abord en diagnostic ou saisie manuelle future, pas encore en modèle structuré.

Justification : le modèle actuel relie des documents à l'animal/réservation, mais ne sait pas distinguer formellement "remis à la cession".

Impact technique futur : futur modèle ou champ structuré à cadrer.

Point à valider par Michael : liste standard des documents remis.

### Numéro d'attestation

Décision proposée : ne pas imposer de numéro d'attestation en Phase 1, sauf besoin métier explicite.

Justification : contrairement à la facture, la numérotation stricte n'est pas encore identifiée comme besoin comptable.

Impact technique futur : peut rester sans numéro ou utiliser un identifiant lisible non fiscal plus tard.

Point à valider par Michael : numéro souhaité oui/non.

### Statut de l'attestation

Décision proposée : prévoir plus tard des statuts simples : brouillon, prêt, remis, archivé.

Justification : l'attestation a un cycle de vie métier distinct des statuts documentaires génériques.

Impact technique futur : à cadrer avant migration si le prototype dépasse la lecture seule.

Point à valider par Michael : statut "remis" nécessaire ou simple document signé/reçu suffit.

### Correction et suppression

Décision proposée : correction possible avant remise ; après remise, correction limitée avec traçabilité ; suppression déconseillée après remise.

Justification : le document formalise une cession et doit rester traçable.

Impact technique futur : permissions, archivage et audit trail éventuel.

Point à valider par Michael : règle de correction après remise.

## 4. Décisions métier recommandées — Facture

### Facture unique finale ou factures arrhes + solde

Décision proposée : démarrer avec une facture finale unique, si validation comptable, et garder les paiements intermédiaires comme événements financiers ou reçus internes non fiscaux.

Justification : c'est l'approche la plus simple pour Phase 1 et elle reste compatible avec les trois parcours financiers.

Impact technique futur : modèle facture plus simple, une facture principale par réservation/animal.

Point à valider par Michael : confirmer avec son comptable/fiscaliste que cette approche convient.

### Reçu interne ou vraie facture d'arrhes

Décision proposée : utiliser des reçus internes de paiement tant que la facture d'arrhes n'est pas validée fiscalement.

Justification : `payment_receipt` existe conceptuellement et évite de créer trop tôt une numérotation fiscale.

Impact technique futur : les reçus ne doivent pas être présentés comme factures.

Point à valider par Michael : besoin réel d'une facture d'arrhes dès Phase 1.

### Création d'une facture brouillon

Décision proposée : créer une facture brouillon seulement quand réservation, adoptant, prix et animal sont connus.

Justification : avant cela, trop de champs seraient instables.

Impact technique futur : brouillon non numéroté ou avec numéro provisoire non fiscal.

Point à valider par Michael : animal obligatoire dès brouillon oui/non.

### Émission définitive

Décision proposée : émission définitive à la vente finale ou au paiement intégral, selon décision comptable.

Justification : l'émission doit figer vendeur, client, animal, lignes, montants et numéro.

Impact technique futur : action sensible owner/admin, verrouillage après émission.

Point à valider par Michael : événement déclencheur exact.

### Statuts facture

Décision proposée : statuts minimaux futurs : `draft`, `issued`, `cancelled`, `credited`.

Justification : distinguer brouillon modifiable, facture officielle, annulation et avoir.

Impact technique futur : modèle dédié nécessaire.

Point à valider par Michael : libellés et cas d'usage.

### Numérotation

Décision proposée : numéro attribué uniquement à l'émission, chronologique, par organisation, avec préfixe annuel à confirmer.

Justification : évite les trous liés aux brouillons et prépare le multi-élevages.

Impact technique futur : mécanisme de séquence transactionnelle, par `organization_id` et période.

Point à valider par Michael : format souhaité, par exemple `2026-0001` ou autre.

### Suppression et correction

Décision proposée : facture brouillon supprimable/corrigeable ; facture émise non supprimable et non modifiable sur les champs fiscaux.

Justification : conservation et traçabilité.

Impact technique futur : soft delete seulement pour brouillons, archivage pour émises.

Point à valider par Michael : règles de correction visibles dans l'UI.

### Avoir après émission

Décision proposée : toute correction financière après émission passe par un avoir, pas par modification de la facture émise.

Justification : le modèle contient déjà `credits`, mais l'avoir fiscal lié à facture devra être cadré.

Impact technique futur : relation facture -> avoir/facture d'avoir ou extension du modèle `credits`.

Point à valider par Michael : différence entre avoir commercial interne et avoir fiscal.

### Liens métier

Décision proposée : facture liée obligatoirement à une réservation, optionnellement à un animal et à des paiements.

Justification : la réservation est le centre opérationnel ; l'animal doit être disponible pour la vente finale ; les paiements expliquent le règlement.

Impact technique futur : tables de relation ou champs dédiés.

Point à valider par Michael : facture possible hors réservation oui/non.

### Lignes de facture

Décision proposée : prévoir au moins une ligne de facture, même si la Phase 1 commence avec une ligne unique "Vente / cession animal".

Justification : lignes nécessaires pour HT/TVA/TTC, libellés, quantités, remboursements ou frais futurs.

Impact technique futur : modèle `invoice_lines`.

Point à valider par Michael : libellé standard de vente.

### Snapshots vendeur/client

Décision proposée : snapshot vendeur et client obligatoire à l'émission.

Justification : une facture ancienne ne doit pas changer si l'organisation ou le contact est modifié plus tard.

Impact technique futur : champs snapshot ou JSON structuré dans le modèle facture.

Point à valider par Michael : informations exactes à figer.

### HT / TVA / TTC

Décision proposée : ne pas gérer TVA dans un prototype tant que le régime fiscal n'est pas confirmé ; prévoir conceptuellement les champs pour ne pas fermer la porte.

Justification : ne pas décider fiscalement à la place de Michael.

Impact technique futur : modèle prêt à stocker HT/TVA/TTC ou mention franchise.

Point à valider par Michael : régime applicable et mentions obligatoires.

### Rôles autorisés et archivage

Décision proposée : émission réservée aux rôles owner/admin ; lecture par membres autorisés ; conservation des factures émises.

Justification : action sensible et multi-organisation.

Impact technique futur : RLS/policies dédiées lors d'un futur lot modèle.

Point à valider par Michael : admin peut émettre ou owner seulement.

## 5. Recommandation de parcours financier

Le système doit rester compatible avec :

- pré-réservation 2 x 250 EUR ;
- réservation directe avec arrhes 500 EUR ;
- paiement intégral sans arrhes séparées.

Décision recommandée : traiter les paiements comme des événements financiers et la facture comme un document émis séparément.

Conséquences :

- ne pas supposer deux paiements de 250 EUR ;
- ne pas supposer que 500 EUR signifie toujours deux arrhes ;
- ne pas supposer qu'il y a toujours des arrhes ;
- calculer le total payé et le solde depuis les paiements ;
- permettre une facture finale unique qui récapitule les paiements déjà enregistrés ;
- garder les reçus internes comme preuve opérationnelle, non fiscale, si validé ;
- ne passer à des factures d'arrhes que si Michael ou son comptable le confirme.

Point de vigilance : les notions "arrhes", "acompte", "solde", "paiement intégral" peuvent avoir des implications juridiques/comptables. Le SaaS doit afficher des diagnostics et données, pas décider du régime fiscal.

## 6. Proposition de modèle conceptuel futur, sans migration

Cette section n'est pas une migration et ne contient pas de SQL applicable.

### `invoices`

Rôle : représenter une facture brouillon ou émise.

Données principales possibles :

- organisation ;
- réservation ;
- contact ;
- animal ;
- statut ;
- numéro de facture ;
- date d'émission ;
- date d'échéance ;
- devise ;
- totaux HT/TVA/TTC ou total unique selon régime ;
- mentions fiscales ;
- snapshots vendeur/client ;
- lien éventuel attestation de vente.

Risque : si cette table est trop pauvre, elle deviendra un simple document ; si elle est trop ambitieuse, elle bloquera la Phase 1.

### `invoice_lines`

Rôle : détailler ce qui est facturé.

Données principales possibles :

- facture ;
- libellé ;
- quantité ;
- prix unitaire ;
- montant total ;
- taux TVA éventuel ;
- ordre d'affichage ;
- lien optionnel animal/réservation.

Risque : complexité inutile si Phase 1 n'a qu'une ligne, mais nécessaire pour une facture comptable propre.

### `invoice_payments` ou relation facture -> paiements

Rôle : associer les paiements utilisés pour régler une facture.

Données principales possibles :

- facture ;
- paiement ;
- montant affecté ;
- date d'affectation.

Risque : double comptage si le même paiement est rattaché à plusieurs factures sans contrainte claire.

### Séquence de numérotation

Rôle : garantir une numérotation chronologique par organisation et période.

Données principales possibles :

- organisation ;
- année ou période ;
- dernier numéro utilisé ;
- préfixe ;
- verrouillage transactionnel.

Risque : trous, doublons ou concurrence si le numéro est calculé côté application.

### Snapshots vendeur/client

Rôle : figer les informations au moment de l'émission.

Données principales possibles :

- nom légal vendeur ;
- forme juridique ;
- SIRET ;
- adresse vendeur ;
- coordonnées vendeur ;
- nom client ;
- adresse client ;
- email/téléphone client si retenus.

Risque : facture historique fausse si elle relit toujours les tables vivantes.

### Type documentaire `sale_certificate`

Rôle : représenter l'attestation de vente dans `documents`.

Données principales possibles :

- document lié à réservation ;
- document lié à animal ;
- statut documentaire ;
- données de preview ;
- plus tard fichier généré ou uploadé.

Risque : confondre type documentaire et modèle métier si l'attestation a besoin d'un cycle de vie propre.

## 7. Ordre de lots recommandé

1. `DOC-5M — Prototype interne attestation de vente`
   - aperçu interne seulement ;
   - sans génération ;
   - sans fichier ;
   - sans PDF ;
   - sans mutation ;
   - diagnostics sur animal, identification, cession, documents liés.

2. `DOC-5N — Décision technique modèle facture`
   - cadrage technique précis ;
   - choix facture finale unique ou factures multiples ;
   - choix numérotation ;
   - choix snapshots ;
   - choix liens paiements/avoirs ;
   - audit/plan avant migration.

3. `DOC-5O — Migration modèle facture brouillon`
   - lot sensible ;
   - seulement après validation métier/comptable ;
   - RLS/policies à cadrer ;
   - types Supabase à régénérer.

4. `DOC-5P — Prototype interne facture brouillon`
   - lecture/édition brouillon selon modèle validé ;
   - sans émission réelle si numérotation non validée ;
   - sans PDF/email/storage.

5. Plus tard seulement :
   - génération PDF ;
   - stockage Supabase Storage ;
   - envoi email ;
   - signature électronique ;
   - archivage documentaire réel ;
   - export comptable éventuel.

## 8. Décisions à valider par Michael

### Attestation de vente

- [ ] Attestation préparée seulement après animal attribué : oui/non
- [ ] Identification obligatoire avant attestation finale : oui/non
- [ ] Date de cession = `adoption_completed_at` : oui/non
- [ ] Réservation obligatoire pour toute attestation : oui/non
- [ ] Contrat de réservation obligatoire avant attestation : oui/non
- [ ] Certificat d'engagement signé/délivré obligatoire avant attestation finale : oui/non
- [ ] Liste des documents remis à afficher : oui/non
- [ ] Numéro d'attestation nécessaire : oui/non
- [ ] Statut attestation brouillon / prêt / remis / archivé nécessaire : oui/non
- [ ] Attestation supprimable après remise : oui/non
- [ ] Correction possible après remise avec traçabilité : oui/non

### Facture

- [ ] Facture finale unique au départ : oui/non
- [ ] Facture d'arrhes dès Phase 1 : oui/non
- [ ] Reçus internes pour paiements : oui/non
- [ ] Facture brouillon créée seulement après animal attribué : oui/non
- [ ] Numéro attribué seulement à l'émission : oui/non
- [ ] Numérotation facture par année : oui/non
- [ ] Numérotation facture par organisation : oui/non
- [ ] Facture émise non supprimable : oui/non
- [ ] Correction limitée aux brouillons : oui/non
- [ ] Avoir obligatoire en cas d'annulation après émission : oui/non
- [ ] TVA gérée dès premier prototype : oui/non
- [ ] Mentions fiscales à valider avant prototype : oui/non
- [ ] Snapshots vendeur/client obligatoires à l'émission : oui/non
- [ ] Lignes de facture dès le modèle initial : oui/non
- [ ] Lien facture -> paiements obligatoire : oui/non
- [ ] Lien facture -> attestation de vente obligatoire : oui/non
- [ ] Rôle autorisé à émettre facture : owner/admin seulement : oui/non

### Validation externe

- [ ] Régime fiscal de Michael confirmé : oui/non
- [ ] Mention TVA / franchise confirmée : oui/non
- [ ] Format de facture validé comptablement : oui/non
- [ ] Distinction reçu interne / facture validée : oui/non

## 9. Recommandation finale

Recommandation : prototyper l'attestation de vente d'abord, puis cadrer techniquement la facture.

Ce qui est sûr :

- l'attestation est un document métier et peut rester un aperçu interne sans génération ;
- la facture demande un modèle plus strict qu'un document ;
- les paiements doivent rester des événements financiers séparés ;
- le workflow ne doit pas être rigidifié autour du parcours 2 x 250 EUR ;
- les données vendeur/client doivent être figées pour une facture émise.

Ce qui doit attendre validation :

- régime fiscal ;
- TVA / franchise ;
- mentions fiscales ;
- facture finale unique ou factures d'arrhes/solde ;
- numérotation ;
- règles d'annulation et d'avoir ;
- statut officiel d'émission ;
- lien obligatoire entre facture et attestation.

La voie la plus prudente est donc :

1. valider les décisions de cette page ;
2. produire un prototype interne d'attestation de vente sans génération ;
3. cadrer techniquement le modèle facture avant toute migration ;
4. ne traiter la facture réelle qu'après validation métier et comptable.

## 10. Exclusions respectées dans ce cadrage

- aucun code applicatif ;
- aucun prototype UI ;
- aucune génération PDF / DOCX / HTML ;
- aucune facture réelle ;
- aucune attestation réelle ;
- aucun fichier documentaire réel ;
- aucun upload ;
- aucun email ;
- aucune signature électronique ;
- aucune migration ;
- aucune RLS / RPC / policy ;
- aucune mutation serveur ;
- aucun template définitif ;
- aucun texte fiscal définitif ;
- aucun SQL applicable ;
- aucun workflow réservation modifié.

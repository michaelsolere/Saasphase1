# Journal de reprise — SaaS élevage

Ce document décrit l’état utile du projet après la PR #277. Il privilégie les invariants, les capacités réellement disponibles, les limites connues et la prochaine étape fonctionnelle à une chronologie exhaustive des PR.

## Référence du projet

- Dépôt : `michaelsolere/Saasphase1`.
- Branche de référence : `main`.
- SHA de `main` documenté : `438aa4202b05b2f76885d865ba5723452f6d2c38`.
- Dernière PR incluse : **#277 — Corriger la bascule du gras et stabiliser l’aperçu**.
- Les migrations locales sont appliquées jusqu’à `202607140002`.
- Stack : Next.js 16 / React 19, TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL, Auth et Storage), déploiement cible Vercel.

## Architecture et règles métier

Le produit est multi-organisation. Les données métier portent un `organization_id`, sont protégées par RLS et sont accessibles selon l’adhésion active et le rôle de l’utilisateur. Les mutations sensibles restent validées côté serveur ; les liens entre objets d’une organisation sont renforcés par des contraintes et clés étrangères composites lorsque nécessaire.

Le modèle repose sur une **fiche Contact unique**. Il ne faut jamais créer de tables séparées `prospects` et `adoptants`. Le parcours central est :

`Contact → Candidature → Réservation → Paiements/Documents → Animal attribué → Adoption → Suivi post-adoption`

Le premier contact peut venir d’un formulaire public générique : la soumission crée ou rapproche le contact puis crée la candidature, sans imposer une saisie manuelle préalable par l’éleveur. Les formulaires publics Phase 1 ne reposent pas sur des liens individuels tokenisés.

Le produit est construit d’abord pour les chiens, tout en conservant `species` pour une extension future aux chats. Les valeurs par défaut restent `dog` et `Golden Retriever`. Stripe, Clerk, la synchronisation Google Agenda et le journal de mise bas offline-first restent hors Phase 1.

## État des modules métier

### Contacts

- Fiche unique pour l’identité, les coordonnées, les rôles, notes, candidatures, réservations, paiements et documents liés.
- Création manuelle ou issue du parcours de formulaire public, avec contrôle des doublons et traitement des soumissions suspectes.
- Édition dédiée avec autorisations d’écriture et confirmations liées aux valeurs effectivement soumises.

### Candidatures

- Création depuis une soumission publique ou depuis un contact existant.
- Qualification, transitions de statut, motifs et notes internes.
- Rattachement à une portée ou à un groupe de portées, puis continuité vers la pré-réservation et la réservation sans dupliquer le contact.

### Réservations et parcours adoptant

- La fiche Réservation est le centre opérationnel du dossier adoptant : contact, candidature, portée ou groupe, animal, paiements, documents, notes, historique et prochaines actions.
- Le parcours couvre notamment brouillon, activation, pré-réservation demandée/payée, confirmation après naissance, attribution d’un animal, préparation de l’adoption et états finaux.
- Les actions sensibles sont explicites et protégées contre les incohérences ou doublons : demandes de paiement, marquage payé, attribution d’animal, annulation, expiration, retrait et adoption.
- Le parcours de pré-réservation gère une première demande d’arrhes puis le complément, avec compensation lorsque l’envoi transactionnel échoue de manière certaine.

### Portées et groupes de portées

- Les groupes structurent une période ou campagne lorsque la portée exacte n’est pas encore arrêtée ; les candidatures et réservations peuvent ensuite être rattachées à une portée précise.
- Les portées portent les parents, dates et événements d’élevage, candidatures/réservations associées, campagnes et animaux nés.
- Les règles d’éligibilité parentale et la cohérence des rattachements sont contrôlées.
- Les chiots d’une portée sont créés dans `animals` depuis la fiche Portée, jamais dans une table dédiée.

### Animaux

- Une seule table couvre les animaux produits, reproducteurs maison, reproducteurs extérieurs, animaux gardés, disponibles, réservés, adoptés ou retraités.
- L’identité, l’origine/détention, le statut administratif, l’identification, la filiation, la portée, l’attribution et la photo principale sont gérés.
- Les animaux produits exigent une portée ; l’attribution à une réservation respecte l’organisation, la portée et l’absence d’une autre attribution active.
- `/animals` est le registre complet ; `/cheptel` est la vue opérationnelle des reproducteurs et animaux réellement conservés par l’élevage.

### Paiements

- Les paiements sont liés au contact et, selon le parcours, à la réservation.
- Le modèle couvre les demandes, règlements et échéances ainsi que les cas métier d’arrhes, remboursement, avoir, report et retenue.
- Le parcours actuel gère notamment la pré-réservation et le complément d’arrhes, avec anti-doublon, idempotence des campagnes et suivi manuel des règlements.
- Aucun encaissement Stripe n’est implémenté en Phase 1.

### Documents

- Les documents peuvent être générés depuis un modèle ou téléversés, et être rattachés aux objets métier pertinents.
- Le moteur PDF réel couvre actuellement le **contrat de réservation** et le **certificat d’engagement** depuis une Réservation.
- Les statuts, dates d’envoi/signature et protections SQL empêchent la régression d’un document envoyé ou signé et préservent ses preuves.

## E-mails transactionnels Brevo

Brevo est intégré côté serveur pour les campagnes transactionnelles. Le socle commun :

- sélection d’un modèle Brevo actif enregistré par organisation ;
- destinataire et variables métier préparés côté serveur ;
- journal persistant dans `email_delivery_attempts` ;
- clé d’idempotence déterministe par organisation, campagne, dossier et version d’opération ;
- claim concurrent, instantanés du modèle/destinataire/variables, suivi `pending` / `sending` / `sent` / `failed`, retries et distinction des erreurs certaines ou incertaines ;
- compensation des ressources métier créées lorsque l’échec est certain et qu’un retour arrière sûr est possible.

`sending` représente une tentative réclamée ; un résultat fournisseur incertain peut rester `sending` afin d’empêcher un nouvel envoi potentiellement doublonné, tandis que les tentatives `failed` peuvent être reprises selon les garde-fous existants.

Campagnes transactionnelles disponibles :

1. **Confirmation de saillie** (`mating_confirmation`) : envoi aux candidatures sélectionnées et éligibles depuis la portée.
2. **Pré-réservation** (`pre_reservation`) : envoi de la demande de pré-réservation, avec création ou réutilisation cohérente de la réservation et de la première demande de paiement.
3. **Contrat + certificat avec complément d’arrhes** (`birth_documents_deposit`) : envoi de l’e-mail post-naissance et création, réactivation ou réutilisation sûre de la demande de complément d’arrhes.

## Moteur PDF et versionnement documentaire

### Familles et versions de modèles

- `document_template_families` porte l’identité stable d’un modèle de référence ; chaque ligne de `document_templates` représente une version de cette famille.
- L’interface `/documents/modeles`, reliée aux actions serveur de gestion, permet de gérer les familles et leurs versions, d’éditer les brouillons, de publier ou retirer une version et de créer la version suivante.
- Une version suit l’un des états `draft`, `published` ou `retired`. Une famille ne peut avoir qu’un seul brouillon et qu’une seule version publiée à la fois.
- La création du prochain brouillon est sûre face aux accès concurrents et attribue la version suivante sans doublon.
- La sauvegarde d’un brouillon utilise un verrou optimiste pour signaler les écritures concurrentes. La publication est atomique et réservée aux rôles autorisés.
- Une version publiée, retirée ou déjà utilisée par un document est immuable ; l’éditeur affiche une version publiée en lecture seule.
- La suppression d’une famille est logique et protégée selon son état et ses usages documentaires.
- Le lien entre un document et son modèle identifie la version exacte au moyen de `documents.template_id` et `documents.source_template_version`.
- La reprise des modèles legacy conserve chaque modèle comme une famille distincte, sans regroupement ni renumérotation.
- La synchronisation du nom et de la description d’une famille vers ses versions conserve les audits propres aux versions.
- La validation métier reste centralisée dans les schémas Zod. La publication vérifie la version exacte validée afin de refuser un brouillon modifié entre la validation et l’écriture ; les erreurs exposées à l’interface restent typées.
- Les rôles `viewer` peuvent lire et valider, les `member` peuvent aussi créer et sauvegarder des brouillons, et seuls `owner` et `admin` peuvent créer une famille ou publier.

### Contrat de réservation V2

- Les nouveaux contrats de réservation utilisent un contenu libre de schéma V2 : `schemaVersion: 2`, `locale: "fr-FR"`, `documentType: "reservation_contract"`, avec un `title` et un `body` textuels.
- Le titre et le corps peuvent être réorganisés librement. Les retours à la ligne et paragraphes vides sont conservés, et aucun contenu automatique legacy n’est ajouté.
- Les contrats V1 restent pris en charge sans conversion automatique ; leur rendu et leurs snapshots historiques ne sont pas modifiés.

### Variables et mise en forme minimale

- Les variables utilisent la syntaxe `[[groupe.variable]]`. Un catalogue centralisé, classé par catégories, permet de les insérer à la position du curseur dans le titre ou le corps.
- Le catalogue couvre le vendeur, l’adoptant, le projet, l’animal, la réservation, les finances, la portée, les parents, le groupe de portées et le document. Il comprend notamment `[[groupe_portees.nom]]` et `[[projet.portee_ou_groupe]]`, qui privilégie la portée nommée puis se replie sur le groupe.
- La résolution s’effectue en une seule passe : une valeur métier ressemblant elle-même à une variable n’est jamais réinterprétée.
- Les aperçus rendent les données manquantes explicites. La génération définitive est bloquée avant tout stockage si une donnée effectivement utilisée est absente ou invalide.
- La seule mise en forme textuelle prise en charge est le gras avec `**texte**`. Le bouton **Gras** et les raccourcis `Cmd+B` / `Ctrl+B` assurent une vraie bascule ajout/retrait à la sélection ou au curseur.
- La bascule reconnaît les variables complètes, exclut les espaces périphériques du gras et refuse les chevauchements ambigus. Le PDF rend le texte concerné en Helvetica-Bold.
- Il ne s’agit pas d’un moteur Markdown ou HTML général.

### Aperçus

- L’éditeur propose un aperçu fictif, ouvrable en grand. Depuis une Réservation, un aperçu réel est disponible lorsqu’un modèle publié compatible existe.
- Un aperçu ne crée ni ligne de document ni objet Storage. Les données manquantes y restent visibles.
- Pendant une syntaxe de gras temporairement incomplète, l’éditeur conserve le dernier aperçu valide. La validation, la publication et la génération définitive restent strictes.

### Modèles et snapshots

- Les modèles documentaires sont définis par des schémas JSON versionnés et validés avec Zod.
- Chaque génération prépare depuis Supabase un snapshot métier complet, typé et validé : organisation/vendeur, contact, candidature, réservation, portée, animal, paiements et modèle selon le document.
- Le snapshot contient la version exacte du modèle et l’instant de capture. Il est conservé dans `documents.generation_data` et devient immuable avec le document généré.

### Rendu, stockage et génération

- Le rendu PDF réel utilise `@react-pdf/renderer` et produit un contrat de réservation ou un certificat d’engagement à partir du snapshot.
- L’orchestrateur enchaîne préparation du snapshot métier, validation, rendu avant stockage, calcul SHA-256, stockage et écriture des métadonnées de façon idempotente.
- Les PDF sont stockés dans le bucket privé `documents`, sous un chemin isolé par organisation et document, avec un numéro de version et le hash du fichier.
- Une nouvelle génération crée une nouvelle ligne et une chaîne `replaces_document_id` ; la version précédente est marquée historique plutôt qu’écrasée.
- Le titre résolu est conservé avec le document. Une nouvelle génération ne modifie jamais l’ancienne ligne, son snapshot ni son PDF historique.
- La génération individuelle se lance actuellement depuis la fiche Réservation, séparément pour le contrat et le certificat, avec contrôle de compatibilité du modèle.

### Consultation sécurisée

- La fiche Document et la fiche Réservation exposent le document courant et son historique de versions.
- Une route serveur authentifiée vérifie l’organisation, les droits et la cohérence des métadonnées avant de diffuser le PDF privé.
- Les versions courantes et historiques restent consultables ; aucun lien Storage public permanent n’est exposé.

## Retours signés

- Un retour signé est une pièce distincte de l’original généré, stockée dans `document_signed_returns` et reliée au document exact concerné.
- L’upload utilise TUS directement vers Supabase Storage après création serveur d’une intention signée ; il est reprenable et limité aux PDF cohérents de 10 Mio maximum.
- La finalisation revalide le chemin, la taille, le hash SHA-256, le contenu stocké, l’original envoyé et les droits avant l’archivage atomique et le passage sûr du document à `signed`.
- En cas d’échec, expiration ou conflit, la compensation supprime uniquement l’objet orphelin dont l’absence de référence a été vérifiée.
- Le retour signé est consultable par une route privée et apparaît comme artefact séparé dans l’historique de la version d’origine.
- Il n’existe qu’un retour signé par document. Une fois archivé, il ne peut être ni substitué, ni supprimé, ni déplacé vers une autre version ; l’original n’est jamais remplacé.

## Limites actuelles et feuille de route immédiate

Restent à concevoir ou implémenter :

- les variantes individuelles liées à une réservation ou à un adoptant ;
- la génération PDF groupée depuis une portée ou un groupe de portées ;
- l’envoi des PDF exacts en pièces jointes Brevo ;
- une éventuelle mise en forme avancée, sans priorité immédiate.

Les contrats V1, les certificats d’engagement, les snapshots historiques, les retours signés, les règles RLS et permissions ainsi que la génération individuelle actuelle depuis une Réservation restent compatibles et inchangés.

La prochaine étape est : **concevoir le socle serveur et le modèle de données des variantes individuelles de documents liées à une réservation, sans encore implémenter leur interface.**

Ce chantier doit préserver le modèle de référence publié, l’origine de la variante, son versionnement, son immutabilité après génération et l’historique des documents.

## Environnement E2E et règles de validation

La stack E2E est isolée de la stack locale de développement :

- projet Supabase : `saasphase1-e2e` au lieu de `saasphase1` ;
- application : `127.0.0.1:3100` au lieu du port `3000` ;
- ports Supabase : `55320–55329` au lieu de `54320–54329` ;
- workdir généré et ignoré : `.supabase-e2e` ;
- conteneurs et volumes dédiés, avec garde-fous refusant la stack de développement ;
- arrêt et nettoyage limités aux ressources `saasphase1-e2e`.

`pnpm test:e2e` ne doit donc ni réinitialiser ni arrêter la stack `saasphase1`, et doit préserver un éventuel `pnpm dev` en cours sur le port `3000`. Le développement courant continue avec `pnpm dev` et la stack locale habituelle.

Avant livraison d’un lot, exécuter au minimum :

```bash
pnpm lint
pnpm build
git diff --check
```

Les tests ciblés et E2E pertinents s’ajoutent selon le risque du lot.

## Méthode de travail et fixtures

- Partir d’un `main` à jour et propre, créer une branche de travail, avancer par petits lots, vérifier le diff et passer par une PR ; aucun commit direct sur `main`.
- Ne pas modifier une migration déjà intégrée : ajouter une migration corrective, puis régénérer et vérifier les types Supabase si le schéma change.
- Préserver les données utilisateur et les changements locaux sans rapport avec le lot.
- Toute fixture persistante doit avoir des identifiants connus dès sa création et être **hard-delete** dans un `finally`, dans l’ordre inverse des dépendances.
- Vérifier explicitement les erreurs de suppression, puis compter avec `count(*)` toutes les tables et objets Storage concernés, sans filtre `deleted_at`. Un soft delete, un reset de base ou un test vert ne prouve pas le nettoyage.
- Nettoyer aussi les reliquats historiques identifiables sans ambiguïté ; ne jamais supprimer une donnée potentiellement réelle.
- Le rapport final doit lister les données temporaires créées et supprimées avec leurs identifiants et le résultat du contrôle final, ou indiquer explicitement qu’aucune donnée temporaire n’a été créée.

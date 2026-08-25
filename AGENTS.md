# Instructions pour les agents IA

Ce projet est un SaaS de gestion d’élevage, d’abord personnel, puis potentiellement commercialisable.

Le projet n’est plus cadré comme une « Phase 1 ». L’objectif est de faire évoluer la base existante vers un logiciel réellement fonctionnel, cohérent et bien pensé, sans simplifier excessivement les workflows ou l’architecture pour réduire l’effort de programmation.

La réalisation reste incrémentale : concevoir les parcours dans leur ensemble, puis les livrer par lots bornés, utilisables et vérifiables. Une fonctionnalité avancée n’est ni interdite par principe ni ajoutée automatiquement ; elle doit répondre à un besoin réel et faire l’objet d’un cadrage proportionné.

## Stack cible

- Next.js / React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase / PostgreSQL
- Supabase Auth
- Supabase Storage
- Vercel

## Principes métier

Le logiciel repose sur une fiche contact unique.

Ne pas créer de tables séparées `prospects` et `adoptants`.

Logique centrale :

Contact unique
→ Candidature
→ Réservation
→ Paiements
→ Documents
→ Chiot attribué
→ Adoption
→ Suivi post-adoption

Le premier contact avec un futur adoptant ne doit pas obliger l’éleveur à créer une fiche contact manuellement.

Le workflow cible est :

1. L’éleveur envoie un lien de formulaire public générique.
2. Le futur adoptant remplit le formulaire.
3. Le système crée une soumission de formulaire.
4. Le système crée ou met à jour un contact.
5. Le système crée une candidature.
6. L’éleveur relit et qualifie la candidature.

## Règles importantes

- Construire d’abord pour les chiens.
- Garder le modèle compatible chats plus tard.
- Utiliser `species` sur les tables concernées.
- Valeurs par défaut : `dog` et `Golden Retriever`.
- Prévoir les formulaires publics génériques lorsque le premier contact ne justifie pas une invitation individualisée.
- Les invitations individualisées sont autorisées lorsqu’elles améliorent réellement le parcours. Utiliser alors des jetons opaques, aléatoires, limités à une action, expirables et révocables ; ne pas exposer d’identifiant métier ou de donnée personnelle dans l’URL.
- Prévoir les paiements avancés : arrhes, remboursement, avoir, report, retenue.
- Prévoir les documents générés et les documents uploadés.
- Prévoir les notes internes et documents liés au contact/candidature.
- Stripe, Clerk, la synchronisation Google Agenda et le journal de mise-bas offline-first ne sont pas prioritaires par défaut. Les intégrer uniquement après validation du besoin, du workflow et du lot correspondant.

## Doctrine produit

- Ne pas simplifier au détriment du métier, de la traçabilité, de la sécurité ou de l’expérience utilisateur.
- Ne pas surconcevoir sans usage concret : préférer un service externe adapté à la réimplémentation de ses fonctions spécialisées.
- Distinguer l’état courant des événements historiques qui l’ont produit.
- Ne pas confondre un signal technique avec une décision métier.
- Toute mutation sensible ou exceptionnelle doit rester explicite, attribuée et historisée.
- Concevoir complètement les cas nominaux, les erreurs, les reprises et les exceptions du lot traité.

## Communications du parcours adoptant

- Brevo est le canal automatisé d’envoi d’emails. Le SaaS conserve la logique métier, les contacts, les variables, les décisions et l’historique ; Brevo conserve les modèles HTML, effectue le transport et retourne les événements techniques.
- Utiliser les paramètres transactionnels fournis par le SaaS plutôt que dupliquer la source de vérité métier dans les attributs et listes de contacts Brevo.
- Distinguer les alertes internes, les emails Brevo et les contacts manuels externes.
- Les envois collectifs sont déclenchés explicitement, les emails individuels sont relus et validés, et seuls les accusés de réception neutres peuvent être automatiques par défaut.
- Les relances ordinaires peuvent être préautorisées ; vérifier leurs conditions juste avant l’envoi et suspendre toute automatisation en cas d’incident sensible.
- Les événements de livraison, d’ouverture et de clic sont des signaux techniques. Une ouverture détectée ne prouve pas une lecture et ne déclenche aucune mutation métier.
- Une réponse familiale structurée peut être révisée jusqu’à son échéance ou sa validation. Conserver chaque version et exiger une validation humaine avant d’appliquer une décision.
- Un décès, une réduction de disponibilité ou toute autre situation sensible ouvre d’abord un incident interne. Aucun email sensible, changement de rang, report, remboursement ou retrait de place ne doit être déclenché silencieusement.
- Présenter les communications, réponses, décisions, contacts manuels et événements techniques dans une chronologie unifiée. Les brouillons restent modifiables ; tout élément envoyé, reçu ou utilisé pour une décision est immuable ou rectifié par ajout d’une nouvelle trace.

## Méthode de travail

Avant toute modification importante :

1. analyser le dépôt ;
2. proposer un plan ;
3. attendre validation si la tâche est structurante ;
4. travailler par petits lots ;
5. résumer les fichiers modifiés ;
6. ne jamais modifier directement la branche `main` si une branche de travail est possible.

## Données temporaires de test — règle impérative

- Toute donnée créée uniquement pour tester une fonctionnalité doit être supprimée avant la finalisation du lot.
- « Supprimer » signifie supprimer physiquement la ligne avec `DELETE`.
- Un soft delete par `deleted_at` ne constitue pas un nettoyage des fixtures de test.
- Un appel Supabase `.delete()` sans vérification explicite de `error` ne constitue pas un cleanup validé.
- Cette règle concerne notamment les contacts, rôles, candidatures, soumissions de formulaire, réservations ou parcours adoptants, paiements, documents, portées, groupes de portées, animaux, modèles d’e-mail, notes, événements et tables de liaison.
- Lorsqu’une donnée de test est créée, conserver immédiatement son identifiant afin de pouvoir la supprimer sans ambiguïté.
- Effectuer le nettoyage avant le commit, le merge et le rapport final.
- Vérifier après nettoyage que les enregistrements créés pour le test n’existent plus et qu’aucun enregistrement dépendant ou orphelin ne subsiste.
- La vérification finale doit compter toutes les lignes concernées avec `count(*)`, sans filtre sur `deleted_at`.
- Une vérification limitée aux UUID du dernier run ne suffit pas lorsqu’il existe des préfixes historiques connus.
- Après correction d’une spec ayant déjà pollué la base, nettoyer et vérifier également les restes des anciens runs.
- Un test réussi n’est pas une preuve de cleanup réussi.
- Un reset de base ne remplace pas la vérification du mécanisme de cleanup du test.
- Toute spec qui crée des fixtures persistantes doit les hard-delete dans son `finally`, dans l’ordre des dépendances.
- Ne jamais supprimer une donnée ambiguë ou potentiellement réelle.
- Une donnée de démonstration ne peut être conservée que si son ajout au seed minimal a été explicitement demandé et validé.
- Privilégier les tests ne nécessitant aucune donnée persistante. Lorsqu’une création est nécessaire, créer puis supprimer les données dans le même lot.
- Ne jamais utiliser une base distante ou de production pour créer des données de test sans autorisation explicite.
- Le rapport final doit toujours indiquer :

- les données temporaires créées ;
- leurs identifiants ;
- les données supprimées ;
- le résultat de la vérification finale ;
- ou explicitement qu’aucune donnée temporaire n’a été créée.
- Un lot ne doit pas être déclaré terminé tant que ce contrôle n’a pas été effectué.

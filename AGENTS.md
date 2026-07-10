# Instructions pour les agents IA

Ce projet est un SaaS de gestion d’élevage, d’abord personnel, puis potentiellement commercialisable.

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
- Ne pas utiliser de lien tokenisé individualisé en Phase 1.
- Prévoir les formulaires publics génériques.
- Prévoir les paiements avancés : arrhes, remboursement, avoir, report, retenue.
- Prévoir les documents générés et les documents uploadés.
- Prévoir les notes internes et documents liés au contact/candidature.
- Ne pas coder Stripe, Clerk, synchronisation Google Agenda ou journal de mise-bas offline-first en Phase 1.

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
- Cette règle concerne notamment les contacts, rôles, candidatures, soumissions de formulaire, réservations ou parcours adoptants, paiements, documents, portées, groupes de portées, animaux, modèles d’e-mail, notes, événements et tables de liaison.
- Lorsqu’une donnée de test est créée, conserver immédiatement son identifiant afin de pouvoir la supprimer sans ambiguïté.
- Effectuer le nettoyage avant le commit, le merge et le rapport final.
- Vérifier après nettoyage que les enregistrements créés pour le test n’existent plus et qu’aucun enregistrement dépendant ou orphelin ne subsiste.
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

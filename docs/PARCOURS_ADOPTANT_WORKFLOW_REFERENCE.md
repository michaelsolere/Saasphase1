# Référence produit — du formulaire public à l’adoption

**Statut : validé**  
**Date de validation : 6 août 2026**  
**Conversation source :** session Hermes `20260806_101854_a98d00`, « Optimisation du parcours adoptant SaaS »  
**Décisions finales de l’utilisateur :** « ok B », puis « Hybride : tableaux compacts et panneaux/contrôles sensibles plus guidés », puis « ok je valide ».

## 1. Rôle de ce document

Ce document consolide les choix fonctionnels et UX validés pour le parcours allant du premier formulaire public à l’adoption du chiot.

Il doit être relu avant de cadrer ou d’implémenter un lot de ce parcours. Il évite de rediscuter l’architecture générale à chaque lot.

Ordre d’autorité en cas de contradiction :

1. une décision explicite plus récente de l’utilisateur ;
2. `AGENTS.md` et les règles métier transversales du dépôt ;
3. le présent document ;
4. les choix techniques historiques du code existant.

Le document fixe la direction d’ensemble. Les règles détaillées propres à un lot — droits, exceptions, concurrence, migrations, RLS, erreurs et reprises — restent à cadrer proportionnellement avant son implémentation. Une précision ultérieure ne doit pas rouvrir arbitrairement les décisions générales déjà validées.

## 2. Objectifs du parcours

Le logiciel doit permettre à l’éleveur de travailler vite tout en conservant la sécurité des décisions métier :

- limiter les clics et les changements de page ;
- conserver le contexte lorsqu’un dossier est ouvert ou agrandi ;
- afficher seulement les informations utiles à l’étape actuelle ;
- éviter les informations répétées sur un même écran ;
- rendre la prochaine action et les urgences immédiatement visibles ;
- traiter successivement plusieurs familles sans perdre les filtres, le tri ou la sélection ;
- guider davantage les opérations sensibles, exceptionnelles ou irréversibles.

## 3. Vocabulaire et frontière métier

Le modèle central reste :

```text
Contact unique
→ Candidature
→ Invitation à se pré-réserver
→ Premier versement reçu et accepté
→ Parcours adoptant
→ Questionnaire et positionnement
→ Paiements et documents
→ Chiot attribué
→ Adoption
→ Suivi post-adoption
```

Règles structurantes :

- La fiche contact reste unique. Il n’existe pas de tables métier séparées « prospect » et « adoptant ».
- Avant le premier versement accepté, la famille reste dans l’espace **Candidats**.
- L’email de pré-réservation est une invitation, pas une réservation et pas une preuve de paiement.
- Le premier versement reçu et accepté ouvre le **parcours adoptant**.
- Le « parcours adoptant » concerne la famille adoptante, jamais le chiot. Le backend peut conserver son ancien vocabulaire de réservation tant qu’il ne déforme pas le produit.
- Une livraison, une ouverture ou un clic Brevo est un signal technique, jamais une décision métier.
- Toute décision sensible doit être explicite, attribuée et historisée.

## 4. Architecture UX validée

### 4.1 Deux espaces distincts mais reliés

La cible produit comporte deux postes de travail principaux :

1. **Candidats**, avant le premier versement accepté ;
2. **Parcours adoptants**, après ce versement.

Les deux espaces utilisent la même grammaire :

1. rechercher, filtrer ou parcourir un tableau ;
2. sélectionner une famille ;
3. consulter son dossier dans un panneau à droite ;
4. réaliser l’action courante dans ce contexte ;
5. passer au dossier suivant sans perdre la vue d’ensemble.

### 4.2 Direction hybride

La direction visuelle validée combine :

- **tableaux, filtres et en-têtes compacts** pour le travail quotidien ;
- **panneau contextuel confortable** pour les consultations et modifications ordinaires ;
- **timeline et prochaine action clairement expliquées** ;
- **vues larges guidées** pour les opérations complexes ou sensibles.

Le panneau ne doit pas compresser une fiche complète dans une largeur insuffisante. Une action comme **« Agrandir le dossier »** ouvre une vue large issue du panneau.

À la fermeture de cette vue, l’interface restaure :

- le tableau d’origine ;
- les filtres et la recherche ;
- le tri ;
- la famille sélectionnée ;
- autant que possible, la position de défilement.

### 4.3 Divulgation progressive

Dans le panneau :

- l’en-tête, l’état actuel et la prochaine action restent immédiatement visibles ;
- la rubrique liée à la prochaine action est ouverte et placée en premier ;
- les autres rubriques gardent un ordre stable et restent repliables ;
- les champs simples sont modifiables directement ;
- une confirmation guidée est réservée aux décisions sensibles.

## 5. Poste de travail Candidats

### 5.1 Tableau principal

Le tableau avec panneau est la vue principale, et non une vue secondaire.

Il doit permettre de lire rapidement :

- le candidat ;
- sa préférence ;
- sa période, son groupe de portées ou sa portée ;
- l’étape actuelle ;
- la prochaine action ou échéance.

Règles validées :

- des colonnes métier bien choisies sont visibles par défaut ;
- quelques colonnes supplémentaires peuvent être affichées ou masquées simplement ;
- les dossiers restent triés principalement par ancienneté de candidature ;
- les urgences restent visuellement repérables sans modifier silencieusement cet ordre ;
- une nouvelle candidature est signalée par un compteur « Nouvelles », un filtre rapide et un badge jusqu’à sa première consultation ;
- la recherche est immédiate ;
- les filtres principaux couvrent au minimum l’étape, la portée ou le groupe, la préférence et l’urgence ;
- les choix de recherche et de filtres sont conservés.

Le comportement actuel de sortie des listes courantes lorsqu’une famille entre dans le parcours adoptant ne doit pas être alourdi par un badge permanent ajouté à toutes les anciennes candidatures. L’accès historique reste possible selon les filtres existants.

### 5.2 Panneau candidat

Le panneau à droite est refermable et, sur ordinateur, redimensionnable. Le tableau et le panneau restent visibles ensemble.

Il présente une synthèse actuelle unique. Le formulaire original reste consultable comme pièce historique ; une comparaison n’apparaît que lorsqu’une divergence utile doit être examinée.

La prochaine action principale est calculée par le SaaS. De petits indicateurs peuvent signaler d’autres sujets ouverts sans concurrencer cette priorité.

### 5.3 Souhait temporel et positionnement avant naissance

Le souhait temporel est distinct de l’organisation métier des portées.

Valeurs structurées :

- au plus tôt ;
- saison précise ;
- pas avant une date ;
- sans préférence particulière.

Interprétation de l’absence de valeur :

- si le champ a été proposé mais laissé vide : **sans préférence particulière** ;
- si le champ n’a jamais été posé ou était désactivé : **préférence inconnue**.

La saison est une information de calendrier indépendante. Les groupes de portées constituent l’organisation métier réelle. Une candidature peut donc :

- exprimer seulement une saison ;
- être rattachée ensuite à un groupe de portées ;
- être positionnée enfin sur une portée précise.

Le positionnement courant doit pouvoir être modifié directement depuis le panneau avec des sélecteurs adaptés.

## 6. Invitation à se pré-réserver et premier versement

### 6.1 Préparation des invitations

L’action est disponible depuis le tableau des candidats. Une fiche de portée peut ouvrir ce même tableau déjà filtré et préparé, plutôt que créer un second workflow concurrent.

Les actions collectives utilisent une sélection multiple et une barre contextuelle limitée aux opérations réellement compatibles. Avant validation, l’interface récapitule :

- les destinataires ;
- les exclusions ;
- les anomalies ;
- le modèle et l’action utilisés.

### 6.2 Brevo

Brevo reste la source de vérité éditoriale des modèles HTML. Le SaaS conserve la logique métier, les destinataires, les variables, les décisions et l’historique.

Avant l’envoi, le SaaS doit :

- afficher les informations du modèle Brevo ;
- contrôler les variables de chaque destinataire ;
- signaler les données manquantes ou incohérentes ;
- proposer, si l’API le permet, une prévisualisation visuelle en lecture seule du rendu Brevo ;
- prévisualiser d’abord le premier destinataire sélectionné ;
- permettre de choisir rapidement un autre destinataire à vérifier.

Le contenu du modèle ne doit pas être dupliqué dans une seconde version modifiable dans le SaaS.

### 6.3 Enregistrement du premier versement

L’action **« Marquer le premier versement reçu »** ouvre une confirmation compacte préremplie avec :

- le montant attendu, modifiable pour enregistrer le montant réel ;
- la date du jour, modifiable si nécessaire ;
- le moyen de paiement à vérifier ;
- une référence facultative.

Si le montant réel est inférieur au montant attendu :

1. le montant réel est enregistré ;
2. il ne devient pas silencieusement un paiement complet ;
3. l’éleveur choisit explicitement s’il l’accepte exceptionnellement comme suffisant ;
4. cette exception exige un motif ;
5. la décision et son auteur sont historisés.

Après création du parcours adoptant, l’interface reste dans le contexte candidat et offre un accès direct au nouveau parcours, plutôt que d’imposer une navigation brutale.

## 7. Poste de travail Parcours adoptants

### 7.1 Tableau principal

Le tableau est regroupé par groupe de portées ou portée, puis classé selon le rang opérationnel dans chaque groupe.

Structure compacte par défaut :

- adoptant ;
- **Souhait / attribution** : préférence avant attribution, puis chiot attribué ;
- rang ;
- étape actuelle ;
- prochaine action ou échéance ;
- petits indicateurs pour les autres sujets ouverts.

Le tableau ne doit pas devenir un tableur avec une colonne distincte pour chaque questionnaire, versement, document ou événement.

### 7.2 Timeline métier

La timeline recommandée comporte sept jalons :

1. Pré-réservé ;
2. Profil relu ;
3. Rang confirmé ;
4. Contrat & arrhes ;
5. Chiot attribué ;
6. Départ prêt ;
7. Adopté.

Dans un panneau étroit, elle utilise une ligne compacte de repères et développe surtout le jalon sélectionné.

L’étape actuelle correspond au premier jalon obligatoire non terminé. Une opération réalisée en avance reste visible, mais ne masque pas un prérequis manquant.

Avant l’ouverture du parcours adoptant, une timeline candidate plus courte peut présenter les quatre grandes étapes précédant le premier versement.

## 8. Questionnaire d’accompagnement

Dans le panneau :

- afficher le statut et une synthèse ;
- ouvrir les réponses complètes dans une vue large issue du panneau ;
- revenir exactement au tableau et au dossier sélectionné après fermeture.

Une donnée proposée par le questionnaire ne remplace jamais silencieusement la donnée courante.

La revue fonctionne changement par changement :

1. l’éleveur accepte ou refuse chaque proposition ;
2. les conséquences sont affichées lorsque nécessaire ;
3. les changements retenus sont appliqués ensemble à la fin de la revue.

Exemple validé : si la préférence de sexe du questionnaire d’accompagnement diffère de la préférence actuelle, la préférence actuelle est conservée jusqu’à ce que l’éleveur adopte explicitement la nouvelle.

## 9. Positionnement après naissance

Cette opération est distincte du simple positionnement d’une candidature avant naissance.

Direction validée :

1. le SaaS prépare un brouillon global à partir des disponibilités, rangs et préférences ;
2. l’éleveur relit et ajuste ce brouillon dans une vue large ;
3. les incompatibilités sont traitées individuellement ;
4. une validation globale applique le positionnement final ;
5. les cas non résolus restent exclus sans empêcher la validation des dossiers prêts.

Le SaaS prépare et explique ; l’éleveur confirme la décision métier.

## 10. Préparation de la réservation

Après confirmation des rangs, une action guidée **« Préparer la réservation »** regroupe :

- les documents attendus ;
- le complément d’arrhes ;
- les variables et l’aperçu Brevo ;
- les anomalies et exclusions ;
- un récapitulatif avant validation finale.

Seules les informations indispensables bloquent l’action. Les données secondaires manquantes produisent un avertissement visible.

Les paiements sont présentés par un résumé compact, la prochaine échéance et les actions courantes. L’historique financier détaillé reste repliable.

Les documents sont présentés par leur état attendu et l’action principale. La liste détaillée et l’aperçu s’ouvrent à la demande, sans imposer une navigation vers un espace séparé pour chaque opération.

## 11. Choix du chiot, attribution et départ

### 11.1 Choix et attribution

Le mode cible est séquentiel selon le rang :

1. afficher à la famille courante les chiots encore disponibles ;
2. confirmer l’attribution ;
3. seulement ensuite passer à la famille suivante.

En cas de pré-choix classé, le SaaS recalcule la meilleure préférence encore disponible, mais l’éleveur confirme l’attribution avant toute information adressée à la famille.

Les réponses possibles autour d’un rendez-vous de choix doivent couvrir au minimum :

- accepter le créneau ;
- demander une visio au même horaire ;
- signaler une impossibilité afin d’organiser un pré-choix avant le rang concerné.

Les modalités exactes de confirmation des rendez-vous restent à préciser dans le lot correspondant.

### 11.2 Organisation du départ

La direction retenue consiste à ouvrir plusieurs créneaux avec capacité. La famille choisit un créneau disponible, ensuite confirmé selon les règles du lot.

Le jour du départ, **« Finaliser l’adoption »** ouvre une vue large de contrôle issue du panneau. Après validation, l’interface revient au même tableau et au même dossier, désormais marqué adopté.

La finalisation doit rester explicite et guidée ; elle ne découle pas silencieusement d’un signal technique ou d’un simple rendez-vous passé.

## 12. Chronologie unifiée

La timeline et la chronologie ont des rôles différents :

- la **timeline** représente les jalons métier ;
- la **chronologie** conserve les faits réels et les communications.

La chronologie unifiée regroupe notamment :

- décisions métier ;
- paiements ;
- documents générés, envoyés ou signés ;
- emails et réponses ;
- changements de positionnement ou d’attribution ;
- échanges manuels.

Les détails techniques d’un email restent repliés sous l’envoi concerné.

Une action discrète **« Ajouter un échange »** permet de tracer un appel, une visite, un SMS, un email externe ou une note, avec résumé court et pièce jointe facultative.

## 13. Règles de sécurité et de cohérence

- Le SaaS distingue toujours l’état courant des événements historiques qui l’ont produit.
- Une action sensible est confirmée, attribuée et historisée.
- Une action collective ne mélange pas des dossiers incompatibles.
- Les cas exclus et les raisons d’exclusion sont visibles avant validation.
- Une ouverture ou un clic d’email ne modifie aucun état métier.
- Un paiement incomplet n’est jamais transformé implicitement en paiement complet.
- Une réponse de questionnaire n’écrase jamais silencieusement une donnée validée.
- Une action réalisée en avance ne masque pas un prérequis manquant.
- Les vues larges conservent le contexte d’origine.
- Les données actuelles ne sont pas dupliquées avec les formulaires historiques ; les divergences utiles sont signalées.

## 14. Ordre de livraison validé

L’ordre général ne doit plus être rediscuté. Seul le détail du lot en cours doit être cadré.

1. `CANDIDATE-WORKBENCH-01` — tableau et panneau Candidats — **livré** ;
2. `CANDIDATE-POSITIONING-AND-PRE-RESERVATION-01` — souhait temporel, portée ou groupe, invitation Brevo et premier versement ouvrant le parcours ;
3. `ADOPTER-WORKBENCH-01` — tableau et panneau Parcours adoptants ;
4. `ACCOMPANIMENT-PROFILE-REVIEW-01` — questionnaire et validation changement par changement ;
5. `POST-BIRTH-POSITIONING-01` — disponibilités, rangs, préférences et validation globale ;
6. `RESERVATION-PREPARATION-01` — documents, complément d’arrhes, variables Brevo et récapitulatif ;
7. `CHOICE-APPOINTMENTS-AND-ASSIGNMENT-01` — rendez-vous de choix et attribution séquentielle ;
8. `DEPARTURE-ORGANIZATION-01` — créneaux, préparation et contrôle final ;
9. `UNIFIED-JOURNEY-HISTORY-01` — chronologie des communications, décisions et échanges manuels.

## 15. Points à préciser lot par lot sans rouvrir l’ensemble

Les éléments suivants ne sont pas des choix d’architecture générale à rediscuter, mais des détails à finaliser au moment du lot concerné :

- rôles et droits exacts pour chaque action ;
- règles de concurrence et d’idempotence ;
- schéma SQL, migrations et politiques RLS ;
- contenu exact des avertissements et blocages ;
- critères complets d’éligibilité et d’exclusion ;
- règles de retard et dérogations ;
- modalités précises de confirmation des rendez-vous ;
- capacités, annulations, reports et rappels des créneaux de départ ;
- erreurs Brevo, reprises et limites fournisseur ;
- critères de correction d’une adoption déjà finalisée ;
- tests, nettoyage des fixtures et vérification finale par `count(*)`.

Toute nouvelle décision validée qui précise ou remplace une section de ce document doit y être reportée afin qu’il reste la référence à jour.

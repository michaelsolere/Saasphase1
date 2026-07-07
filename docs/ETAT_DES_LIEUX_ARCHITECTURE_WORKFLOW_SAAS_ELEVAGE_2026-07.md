# Etat des lieux architecture et workflow SaaS elevage - juillet 2026

## 1. Synthese generale

Cet etat des lieux documente l'architecture et les workflows reellement constates dans l'application SaaS d'elevage au debut juillet 2026.

Le produit est deja structure autour du principe metier central : une fiche contact unique, sans tables separees `prospects` et `adoptants`. Le parcours implemente couvre deja les objets principaux suivants :

- contact ;
- candidature ;
- reservation / parcours adoptant ;
- paiements ;
- documents ;
- portees et groupes de portees ;
- animaux ;
- notes ;
- evenements ;
- modeles d'emails ;
- dashboard de flux.

L'application est fonctionnelle mais reste volontairement prudente : la plupart des transitions importantes sont manuelles ou semi-automatiques. Les automatisations reelles existent surtout autour du formulaire public, de la creation de candidature, de certains roles contact, du paiement de pre-reservation de 250 euros, du seuil d'arrhes de 500 euros, de l'initialisation documentaire et de l'attribution/adoption d'un animal.

Les exclusions Phase 1 restent globalement respectees : pas de Stripe, pas de Clerk, pas de synchronisation Google Agenda, pas de journal de mise-bas offline-first, pas d'email reel, pas de generation PDF/DOCX reelle, pas d'upload documentaire reel et pas de signature electronique.

## 2. Architecture reelle

### Reellement implemente

L'application utilise Next.js App Router avec une organisation claire :

- `src/app` contient les routes et pages ;
- `src/features` contient les modules metier ;
- `src/components` contient les composants partages ;
- `src/lib/supabase` contient les clients Supabase serveur, client et proxy ;
- `src/types/database.types.ts` contient les types Supabase generes ;
- `supabase/migrations` contient le modele SQL, les vues, RPC, policies RLS et extensions ulterieures.

Les principaux modules metier sont :

- `src/features/contacts` ;
- `src/features/applications` ;
- `src/features/reservations` ;
- `src/features/payments` ;
- `src/features/documents` ;
- `src/features/litters` ;
- `src/features/animals` ;
- `src/features/public-application` ;
- `src/features/settings` ;
- `src/features/auth`.

Les actions serveur sont organisees par domaine, par exemple :

- `src/features/contacts/actions.ts` ;
- `src/features/applications/actions.ts` ;
- `src/features/reservations/actions.ts` ;
- `src/features/payments/actions.ts` ;
- `src/features/documents/actions.ts` ;
- `src/features/litters/actions.ts` ;
- `src/features/animals/actions.ts` ;
- `src/features/settings/actions.ts`.

Les pages privees relisent generalement l'utilisateur via `supabase.auth.getUser()` et redirigent vers `/login` si besoin. Le proxy Next protege explicitement `/candidatures/*` et `/login`, mais la protection globale de toutes les routes privees reste principalement portee par les pages serveur elles-memes.

### Partiellement implemente

La logique de routing prive/public est fonctionnelle, mais pas centralisee. Certaines routes sont protegees par middleware, d'autres par verification locale dans la page.

La logique Supabase est bien presente, avec RLS, policies, vues `security_invoker`, RPC publique et types generes, mais il n'existe pas encore de couche metier centralisee entre les actions serveur et Supabase. Plusieurs workflows importants sont donc codes directement dans les actions serveur.

### Decide mais non implemente

Une separation plus nette entre couche UI, couche action serveur et couche service metier n'est pas encore implementee.

## 3. Modele metier reel

### Contacts

Source principale : table `contacts`.

Relations principales :

- `contact_roles.contact_id` ;
- `applications.contact_id` ;
- `reservations.contact_id` ;
- `payments.contact_id` ;
- `documents.contact_id` ;
- `notes.contact_id` ;
- `events.contact_id`.

Vue associee : `contact_overview`.

Pages principales :

- `/contacts` ;
- `/contacts/new` ;
- `/contacts/[id]`.

Actions principales :

- `createContact` ;
- `addContactRole` ;
- `createContactNote` ;
- creation rapide de contact depuis le parcours reservation.

### Contact roles

Source principale : table `contact_roles`.

Roles existants :

- `prospect` ;
- `candidate` ;
- `pre_reservation_holder` ;
- `reservation_holder` ;
- `adopter` ;
- `former_adopter` ;
- `stud_owner` ;
- `veterinarian` ;
- `partner_breeder` ;
- `mediation_organization` ;
- `supplier` ;
- `other`.

Contrainte importante : un index unique limite un role actif donne par contact et organisation.

Zone floue : le role SQL `prospect` est libelle "Non attribue", et l'absence de role est aussi affichee "Non attribue".

### Candidatures

Source principale : table `applications`.

Sources associees :

- `form_submissions` ;
- `public_forms` ;
- `contacts`.

Vue associee : `application_overview`.

Statuts existants :

- `new` ;
- `to_review` ;
- `to_call` ;
- `qualified` ;
- `waiting_litter` ;
- `rejected` ;
- `withdrawn` ;
- `archived`.

Pages principales :

- `/candidatures` ;
- `/candidatures/[id]` ;
- `/contacts/[id]/applications/new`.

Actions principales :

- `createApplicationForContact` ;
- `updateApplicationStatus` ;
- `createReservationFromApplication` ;
- `createApplicationNote` ;
- `updateApplicationDesiredLitter`.

### Reservations / parcours adoptants

Source principale : table `reservations`.

Vue associee : `reservation_overview`.

Relations principales :

- contact ;
- candidature ;
- groupe de portees ;
- portee ;
- animal ;
- paiements ;
- documents ;
- notes ;
- evenements.

Statuts SQL existants :

- `draft` ;
- `pending_positioning` ;
- `pre_reservation_requested` ;
- `pre_reservation_paid` ;
- `active` ;
- `confirmed_after_birth` ;
- `waiting_for_available_sex` ;
- `postponed` ;
- `animal_assigned` ;
- `adoption_ready` ;
- `adopted` ;
- `withdrawn` ;
- `expired` ;
- `cancelled` ;
- `archived`.

Pages principales :

- `/reservations` ;
- `/reservations/new` ;
- `/reservations/[id]`.

Actions principales :

- `createReservationFromApplication` ;
- `createReservationDirect` ;
- `activateReservation` ;
- `cancelReservation` ;
- `withdrawReservation` ;
- `expireReservation` ;
- `assignAnimalToReservation` ;
- `unassignAnimalFromReservation` ;
- `adoptReservation` ;
- `updateReservationPrice` ;
- `updateReservationInternalComment` ;
- `updateReservationPreReservationDeadline` ;
- `createReservationNote` ;
- `upsertReservationAppointment` ;
- `launchPreReservationCampaign`.

### Paiements

Source principale : table `payments`.

Sources associees :

- `credits` ;
- `credit_usages`.

Types SQL existants :

- `pre_reservation_deposit_refundable` ;
- `arrhes` ;
- `balance` ;
- `refund` ;
- `partial_refund` ;
- `credit_use` ;
- `withholding` ;
- `transfer_to_future_reservation` ;
- `other`.

Statuts SQL existants :

- `requested` ;
- `pending` ;
- `partially_paid` ;
- `paid` ;
- `partially_refunded` ;
- `refunded` ;
- `converted_to_credit` ;
- `transferred` ;
- `cancelled` ;
- `failed` ;
- `disputed`.

Pages principales :

- `/payments` ;
- `/payments/[id]`.

Actions principales :

- `createReservationPayment` ;
- `markPaymentAsPaid` ;
- `markReservationPaymentAsPaid` ;
- `createReservationRefund`.

### Documents

Sources principales :

- `documents` ;
- `document_templates`.

Types SQL existants :

- `phone_call_summary` ;
- `plaud_transcript` ;
- `application_form` ;
- `reservation_contract` ;
- `commitment_certificate` ;
- `payment_receipt` ;
- `invoice` ;
- `sale_certificate` ;
- `welcome_booklet` ;
- `photo_use_authorization` ;
- `other`.

Statuts SQL existants :

- `to_generate` ;
- `generated` ;
- `uploaded` ;
- `sent` ;
- `signed` ;
- `received` ;
- `archived` ;
- `missing` ;
- `expired` ;
- `cancelled` ;
- `not_applicable`.

Pages principales :

- `/documents` ;
- `/documents/[id]` ;
- `/documents/email-templates`.

Actions principales :

- `initializeReservationDocuments` ;
- `markDocumentAsSent` ;
- `markDocumentAsSigned` ;
- `markReservationDocumentsAsSent` ;
- `markReservationDocumentsAsSigned`.

### Modeles d'emails

Source principale : table `email_templates`.

Categories existantes :

- `candidate_journey` ;
- `adopter_journey` ;
- `post_adoption`.

Actions principales :

- `getEmailTemplatesForCurrentOrganization` ;
- `createEmailTemplate` ;
- `updateEmailTemplate`.

### Portee et groupes de portees

Sources principales :

- `litter_groups` ;
- `litters`.

Vue associee : `litter_overview`.

Pages principales :

- `/litter-groups` ;
- `/litter-groups/new` ;
- `/litter-groups/[id]` ;
- `/litters` ;
- `/litters/new` ;
- `/litters/[id]`.

Actions principales :

- `createLitterGroup` ;
- `updateLitterGroupDetails` ;
- `createLitter` ;
- `updateLitterDetails` ;
- `updateLitterGroupAssignment` ;
- `createLitterOffspring` ;
- `createLitterEvent` ;
- `launchPreReservationCampaign`.

### Animaux

Source principale : table unique `animals`.

Relations principales :

- `litter_id` pour les animaux produits par une portee ;
- `father_id` et `mother_id` pour les parents ;
- `reservations.animal_id` pour l'attribution ;
- `documents.animal_id` ;
- `notes.animal_id` ;
- `events.animal_id`.

Pages principales :

- `/animals` ;
- `/animals/new` ;
- `/animals/[id]` ;
- `/animals/[id]/edit` ;
- `/cheptel`.

Actions principales :

- `createManualAnimal` ;
- `updateAnimalIdentity` ;
- `updateAnimalFinalIdentity` ;
- `promoteAnimalToHomeBreeder` ;
- `keepAnimalAtKennel` ;
- `makeKeptAnimalAvailable` ;
- `createAnimalHealthEvent`.

## 4. Workflow Contact

### Reellement implemente

Un contact peut etre cree manuellement depuis `/contacts/new`. La creation accepte les informations de base et un role initial optionnel. Si aucun role initial n'est choisi, le contact existe sans role actif.

Un contact peut aussi etre cree automatiquement depuis le formulaire public. La RPC `submit_public_application` cree une soumission de formulaire, recherche un contact existant par email et telephone, cree ou rattache le contact, cree une candidature, puis ajoute le role `candidate`.

Lorsqu'une candidature manuelle est creee pour un contact, le role `candidate` est ajoute si absent. Si un role actif `prospect` existe, il peut etre desactive dans ce parcours.

Lorsqu'une reservation est creee depuis une candidature qualifiee, le role `pre_reservation_holder` est ajoute si absent.

Lors du paiement d'une premiere arrhe de 250 euros sur une reservation en `pre_reservation_requested`, le role `pre_reservation_holder` est ajoute si besoin et le role `candidate` est desactive.

Lorsque le total des arrhes payees atteint 500 euros, le role `reservation_holder` est ajoute et le role `pre_reservation_holder` est desactive.

Lors de l'adoption, le role `adopter` est ajoute et les roles `reservation_holder` et `candidate` sont desactives si l'ajout a bien lieu.

### Partiellement implemente

La mise a jour automatique d'un contact existant depuis une nouvelle soumission publique est limitee. Le systeme rattache au contact existant si email et telephone correspondent exactement, mais ne met pas a jour de facon complete les coordonnees du contact.

La gestion des doublons issus du formulaire public est maintenant traitee par un workflow de revue humaine dedie. Le systeme ne fusionne pas automatiquement les contacts, n'ecrase pas les coordonnees d'un contact existant et conserve toujours la soumission originale.

### Hypothese a verifier

L'intention metier du role `prospect` doit etre clarifiee, car son libelle actuel "Non attribue" peut se confondre avec l'absence totale de role.

## 5. Workflow Candidature

### Reellement implemente

Le formulaire public `/candidature/golden-retriever-2026` charge une vue publique minimale du formulaire, valide les champs cote client, puis appelle la RPC `submit_public_application`.

La RPC :

1. valide les champs obligatoires ;
2. verifie le formulaire public actif ;
3. cree une ligne `form_submissions` ;
4. recherche un contact par email et telephone ;
5. cree un contact ou rattache un contact existant ;
6. cree une candidature en `to_review` ;
7. ajoute le role `candidate` ;
8. met a jour la soumission en `application_created`.

En cas de suspicion de doublon, la soumission passe en `duplicate_suspected` et aucune candidature n'est creee.

La reponse publique reste volontairement generique : le candidat recoit seulement un statut accepte et une reference publique. Aucune information sensible sur les contacts existants, la detection de doublon ou la decision interne n'est revelee publiquement.

#### Soumissions publiques suspectes et doublons

Les soumissions suspectes ne sont plus invisibles. Elles sont listees dans `/form-submissions` lorsqu'elles sont en `duplicate_suspected` ou `pending_human_review`, puis consultables dans `/form-submissions/[id]`.

Depuis le detail, l'eleveur garde la decision humaine explicite :

- rattacher la soumission au contact suggere existant ;
- creer un nouveau contact distinct et une candidature liee ;
- archiver la soumission sans candidature.

Le rattachement a un contact existant passe par la RPC privee `resolve_suspect_form_submission_existing_contact`. Elle verrouille la soumission, verifie l'organisation, refuse le double traitement, cree une candidature liee, promeut le role `candidate` et ne modifie pas les coordonnees du contact existant.

La creation d'un nouveau contact passe par la RPC privee `resolve_suspect_form_submission_new_contact`. Elle cree uniquement un nouveau contact depuis les donnees de la soumission, cree une candidature liee, promeut ce nouveau contact en `candidate` et ne touche a aucun contact existant.

L'archivage sans candidature passe par la RPC privee `archive_suspect_form_submission_without_application`. Elle est stricte : la soumission doit etre `duplicate_suspected`, avoir `duplicate_resolution = pending_human_review`, ne pas avoir de `contact_id` et ne pas avoir d'`application_id`. Elle ne cree ni contact, ni candidature, ni role, et conserve l'historique via la soumission archivee.

L'integrite est renforcee par un index unique partiel `applications_form_submission_id_unique_idx` sur `applications(form_submission_id)` lorsque `form_submission_id is not null`. Il empeche deux candidatures de pointer vers la meme soumission.

Le champ `applications.source_channel` est harmonise sur les chemins de creation par formulaire public, resolution par contact existant et resolution par nouveau contact.

Les tests e2e cibles dans `tests/e2e/form-submission-integrity.spec.ts` couvrent notamment :

- soumission publique normale avec `source_channel` reporte sur la candidature ;
- soumission publique ambigue restant suspecte sans exposer de detail au public ;
- resolution par contact existant et refus du double traitement ;
- resolution par nouveau contact et refus d'une deuxieme candidature pour la meme soumission ;
- archivage strict et refus du double archivage.

Les transitions de candidature exposees sont :

- `new` ou `to_review` vers `to_call`, `qualified`, `rejected`, `archived` ;
- `to_call` vers `qualified`, `rejected`, `archived` ;
- `qualified` ou `waiting_litter` vers `withdrawn`, `rejected`, `archived` ;
- `rejected`, `withdrawn` ou `archived` vers reactivate selon les cas.

Les libelles affiches principaux sont :

- `new` et `to_review` : "A valider" ;
- `to_call` : "A appeler" ;
- `qualified` : "Validee" ;
- `waiting_litter` : "En attente de portee" ;
- `rejected` : "Refusee" ;
- `withdrawn` : "Non aboutie" ;
- `archived` : "Archivee".

Une candidature qualifiee peut etre transformee en reservation via `createReservationFromApplication`.

### Partiellement implemente

La timeline candidat existe par les notes, documents, evenements et reservations associes, mais il n'y a pas encore de moteur de timeline metier centralise.

Le statut `waiting_litter` existe, mais son usage automatise reste limite.

### Decide mais non implemente

Le classement, le scoring, la qualification detaillee et la fusion manuelle avancee de doublons ne sont pas encore implementes.

## 6. Workflow Reservation / Parcours adoptant

### Reellement implemente

Une reservation peut etre creee depuis une candidature qualifiee. Elle est creee en `draft`, reprend le contact, la candidature, l'espece, la race, la portee ou le groupe souhaite et la preference de sexe.

Une reservation peut aussi etre creee directement depuis `/reservations/new`, avec choix du contact, candidature optionnelle, portee ou groupe, preference de sexe, prix et commentaire interne.

La campagne de pre-reservation lancee depuis une fiche portee cree ou reutilise une reservation et cree une demande de paiement de 250 euros en `arrhes`, statut `requested`, echeance J+15. La reservation passe alors de `draft` a `pre_reservation_requested` seulement apres creation effective de la demande de paiement.

La fiche reservation `/reservations/[id]` est le centre operationnel du dossier adoptant. Elle affiche notamment :

- resume du dossier ;
- contact ;
- candidature ;
- portee et groupe ;
- animal attribue ou attribuable ;
- paiements ;
- documents ;
- notes ;
- rendez-vous et evenements ;
- actions disponibles.

Les actions de statut exposees incluent :

- activation `draft` vers `active` ;
- annulation depuis `active` ;
- desistement depuis `active` ;
- expiration depuis `active` ;
- adoption depuis `animal_assigned` si un animal est attribue.

L'attribution animal est manuelle. Elle renseigne `reservations.animal_id`, `animal_assigned_at`, passe la reservation en `animal_assigned`, et met l'animal en `reserved` si son statut le permet.

L'adoption passe la reservation en `adopted`, renseigne `adoption_completed_at`, ajoute le role `adopter`, et met l'animal en `adopted` avec `ownership_status = adopted_out`.

### Partiellement implemente

Plusieurs statuts SQL existent mais ne correspondent pas encore a un workflow complet expose dans l'interface, par exemple :

- `pending_positioning` ;
- `confirmed_after_birth` ;
- `waiting_for_available_sex` ;
- `postponed` ;
- `adoption_ready`.

Le parcours adoptant est bien structure, mais les etapes juridiques, documentaires et financieres ne sont pas encore orchestrees dans un moteur unique.

### Decide mais non implemente

Il n'existe pas encore de workflow complet "reservation consolidee apres naissance" combinant automatiquement documents signes, complement d'arrhes, attribution et confirmation finale.

## 7. Workflow Paiements

### Reellement implemente

Les paiements sont rattaches au contact et optionnellement a une reservation.

Depuis une reservation, l'utilisateur peut creer :

- un paiement `arrhes` ;
- un paiement `balance`.

Le statut initial peut etre `requested` ou `paid`. Les methodes exposees sont notamment virement, especes, carte, cheque et autre.

Un paiement demande peut etre marque paye depuis la fiche paiement ou depuis la fiche reservation.

Automatisations reelles :

- si un paiement `arrhes` de 250 euros est marque paye sur une reservation en `pre_reservation_requested`, la reservation passe en `pre_reservation_paid` ;
- ce meme cas ajoute `pre_reservation_holder` si absent et desactive `candidate` ;
- si le total des paiements `arrhes` payes atteint au moins 500 euros, le role `reservation_holder` est ajoute et `pre_reservation_holder` est desactive.

Un remboursement manuel peut etre cree comme paiement de type `refund`, statut `paid`.

La vue `reservation_overview` calcule :

- `paid_cents` ;
- `refunded_cents`.

### Partiellement implemente

Le modele SQL prevoit les avoirs, reports, retenues, remboursements partiels et credits. La RPC `use_credit` existe. L'exposition UI et le workflow metier complet restent limites.

### Decide mais non implemente

Stripe n'est pas implemente.

Il n'y a pas de paiement en ligne reel, de rapprochement bancaire, de recu genere, ni de facture technique.

## 8. Workflow Documents

### Reellement implemente

Les documents sont stockes dans la table `documents` avec des liens polymorphes vers contact, candidature, reservation, portee, animal et paiement.

Depuis une reservation, l'action `initializeReservationDocuments` cree les documents attendus suivants si les conditions sont remplies :

- certificat d'engagement et de connaissance ;
- contrat de reservation.

Conditions principales :

- reservation en `pre_reservation_paid` ;
- au moins un paiement `arrhes` de 250 euros paye ;
- documents non deja presents.

Les documents crees sont en `to_generate` et `signature_required = true`.

Actions documentaires exposees :

- marquer un document comme envoye ;
- marquer un document comme recu signe ;
- marquer le lot certificat + contrat comme envoye ;
- marquer le lot certificat + contrat comme signe.

La page `/documents/[id]` sert d'aperçu interne complet des donnees sources. Elle agrege notamment :

- organisation ;
- representant ;
- parametres documentaires ;
- contact ;
- candidature ;
- reservation ;
- portee ;
- groupe de portees ;
- animal ;
- paiements ;
- documents lies ;
- notes ;
- evenements.

### Partiellement implemente

Le type `sale_certificate` est reconnu dans certaines actions documentaires, mais le workflow technique complet de l'attestation de vente n'est pas finalise.

La facture est cadree dans la documentation projet, mais n'est pas implementee techniquement.

### Decide mais non implemente

Il n'y a pas encore :

- generation PDF ;
- generation DOCX ;
- upload reel ;
- signature electronique ;
- email reel avec piece jointe ;
- modele documentaire rendu en fichier final.

## 9. Modeles d'emails

### Reellement implemente

Les modeles d'emails sont stockes dans `email_templates`.

Des modeles par defaut sont crees ou assures lors de la lecture des modeles de l'organisation.

Categories :

- `candidate_journey` ;
- `adopter_journey` ;
- `post_adoption`.

Les actions permettent :

- lecture des modeles ;
- creation d'un modele personnalise ;
- modification du titre, de la categorie, du sujet et du corps.

### Partiellement implemente

Les modeles couvrent des moments du parcours candidat, adoptant et post-adoption, mais ils ne sont pas relies automatiquement aux statuts ou actions du workflow.

### Decide mais non implemente

Il n'y a pas :

- envoi reel ;
- historique d'envoi ;
- statut d'email ;
- pieces jointes ;
- automatisation d'envoi.

## 10. Portees / groupes de portees

### Reellement implemente

Les groupes de portees permettent de structurer des campagnes ou periodes. Ils portent :

- nom ;
- description ;
- espece ;
- periode attendue ;
- statut.

Les portees portent :

- nom ;
- espece ;
- race ;
- mere ;
- pere ;
- groupe optionnel ;
- dates de saillie et naissance ;
- confirmation de gestation ;
- nombres attendus et nes ;
- statut.

Les fiches portee affichent les animaux lies, reservations, notes, evenements, documents et candidatures associees.

Une portee peut servir de base a une campagne de pre-reservation pour les candidatures qualifiees rattachees a cette portee.

### Partiellement implemente

Les groupes de portees sont deja un axe de pilotage utile, mais leur role dans les decisions de priorisation, rang et affectation n'est pas encore completement formalise.

Les candidatures et reservations peuvent etre liees a une portee ou un groupe, mais il n'existe pas encore de moteur de matching automatique.

### Decide mais non implemente

Pas de journal de mise-bas offline-first.

Pas d'automatisation complete des jalons de reproduction.

## 11. Animaux

### Reellement implemente

Le modele utilise une table unique `animals`.

Il n'existe pas de table separee pour les chiots ou chatons. Les animaux produits sont des lignes `animals` rattachees a une portee via `litter_id`.

La creation manuelle d'un animal est prevue pour :

- reproductrice maison ;
- male maison ;
- etalon exterieur ;
- femelle exterieure ;
- retraite ;
- historique.

La creation des chiots/chatons de portee se fait depuis la fiche portee. Les animaux crees ont :

- `litter_id` ;
- `status = born` ;
- `ownership_status = produced` ;
- parents repris de la portee si presents ;
- espece et race reprises de la portee.

L'attribution a une reservation se fait depuis la fiche reservation. L'animal peut passer en `reserved`.

L'adoption met l'animal en `adopted` et `ownership_status = adopted_out`.

L'identite definitive peut etre modifiee, notamment nom choisi, identification et LOF.

La vue `/cheptel` presente une synthese operationnelle du cheptel reel, distincte de la liste complete `/animals`.

### Partiellement implemente

La section sante animal existe en lecture et permet un ajout manuel d'evenement sante, mais il ne s'agit pas d'un module sante complet.

### Decide mais non implemente

Photos, medias, documents veterinaires complets, rappels sante et suivi sanitaire avance ne sont pas implementes.

## 12. Dashboard

### Reellement implemente

Le dashboard d'accueil affiche des donnees de flux :

- candidatures a traiter via `application_overview` ;
- paiements demandes ou a suivre via `payments` ;
- documents a produire, envoyer ou faire signer via `documents` ;
- reservations actives via `reservation_overview` ;
- portees en suivi via `litters` ;
- noms de contacts associes.

Il fournit des liens vers les fiches metier.

### Partiellement implemente

Le dashboard aide deja a voir les flux, mais il ne correspond pas encore pleinement a l'objectif "ce qui demande mon attention aujourd'hui".

### Decide mais non implemente

Il n'existe pas encore d'inbox priorisee globale basee sur echeances, urgence, taches, blocages et prochaine action calculee.

## 13. Securite Supabase

### Reellement implemente

Les migrations structurantes sont :

- schema core : organisations, profils, memberships, settings ;
- schema metier : contacts, candidatures, reservations, portees, animaux, paiements, documents, notes, evenements ;
- indexes, vues, RPC, RLS ;
- securisation de la vue publique formulaire ;
- parametres documentaires organisation ;
- modeles d'emails.

RLS est activee sur les tables metier principales.

Les policies s'appuient sur :

- `is_member_of` ;
- `has_organization_role` ;
- `shares_organization_with`.

Les vues metier utilisent `security_invoker`.

La vue publique `public_form_public_view` expose uniquement les metadonnees minimales des formulaires actifs via une fonction privee `private.list_active_public_forms`.

La RPC `submit_public_application` est en `security definer` et accordee a `anon` et `authenticated`.

Les RPC privees de resolution des soumissions suspectes et d'archivage sont en `security definer`, utilisent un `search_path` securise, verrouillent la soumission cible et sont accordees uniquement a `authenticated`.

Le modele evite les ENUM PostgreSQL et utilise des colonnes `text` avec contraintes `check`.

Une contrainte d'integrite supplementaire protege le lien formulaire-candidature : l'index unique partiel `applications_form_submission_id_unique_idx` interdit deux candidatures pour une meme `form_submission`.

### Points sensibles a ne pas casser

- grants et RLS de la RPC publique ;
- non-exposition directe de `public_forms` a `anon` ;
- vues `security_invoker` ;
- contraintes textuelles de statuts et types ;
- foreign keys composites incluant `organization_id` ;
- logique multi-tenant par organisation.

## 14. Automatisations existantes

### Reellement implemente

Automatisations constatees :

1. Soumission publique :
   - creation `form_submissions` ;
   - creation ou rattachement contact ;
   - creation candidature ;
   - ajout role `candidate` ;
   - en cas de doublon suspect, passage en revue humaine sans exposer le detail au public.

2. Resolution de soumission suspecte :
   - rattachement explicite au contact suggere ou creation explicite d'un nouveau contact ;
   - creation candidature liee ;
   - promotion role `candidate` ;
   - conservation de la soumission originale.

3. Archivage de soumission suspecte :
   - archivage sans contact, sans candidature et sans role ;
   - conservation de l'historique et du commentaire interne facultatif.

4. Creation candidature manuelle :
   - ajout role `candidate` ;
   - desactivation possible de `prospect`.

5. Creation reservation depuis candidature :
   - creation reservation `draft` ;
   - ajout role `pre_reservation_holder`.

6. Campagne pre-reservation :
   - creation ou reutilisation reservation ;
   - creation demande paiement 250 euros ;
   - passage `draft` vers `pre_reservation_requested`.

7. Paiement 250 euros :
   - passage reservation `pre_reservation_requested` vers `pre_reservation_paid` ;
   - ajout role `pre_reservation_holder` ;
   - desactivation role `candidate`.

8. Arrhes payees au moins 500 euros :
   - ajout role `reservation_holder` ;
   - desactivation role `pre_reservation_holder`.

9. Initialisation documentaire :
   - creation certificat d'engagement ;
   - creation contrat de reservation.

10. Attribution animal :
   - lien reservation-animal ;
   - passage reservation en `animal_assigned` ;
   - passage animal en `reserved` si applicable.

11. Adoption :
   - passage reservation en `adopted` ;
   - ajout role `adopter` ;
   - desactivation roles `reservation_holder` et `candidate` ;
   - passage animal en `adopted` et `adopted_out`.

## 15. Decisions metier actees

### Reellement acte dans le code

- Fiche contact unique.
- Pas de tables separees prospects/adoptants.
- Construction prioritaire pour chiens, avec compatibilite chats via `species`.
- Valeurs par defaut `dog` et `Golden Retriever`.
- Formulaire public generique, non tokenise individuellement.
- Candidature publique qui cree ou rattache contact et candidature.
- Soumission publique suspecte revue humainement avant toute creation de candidature.
- Pas de fusion automatique de contact et pas d'ecrasement de contact existant depuis une resolution de doublon.
- Conservation de la soumission originale comme trace du formulaire public.
- Chiots/chatons dans `animals`, pas dans une table separee.
- Documents et notes lies aux objets metier.
- Paiements avances prevus par le modele SQL.
- Statuts et types geres en `text check`, pas en ENUM PostgreSQL.

## 16. Decisions partiellement implementees

- Parcours pre-reservation en deux temps 250 euros puis 500 euros.
- Documents de reservation apres pre-reservation payee.
- Attestation de vente et facture cadrees mais non completement implementees.
- Avoirs, reports, retenues et remboursements avances prevus mais peu exposes.
- Suivi post-adoption prevu par modeles d'emails, mais sans workflow reel.
- Dashboard de pilotage existant, mais pas encore centre sur les actions du jour.
- Groupes de portees comme axe de pilotage, mais sans moteur de priorisation automatique.

## 17. Fonctionnalites decidees mais non implementees

- Envoi email reel.
- Generation PDF.
- Generation DOCX.
- Upload documentaire reel.
- Signature electronique.
- Stripe ou paiement en ligne.
- Clerk.
- Synchronisation Google Agenda.
- Journal de mise-bas offline-first.
- Recherche libre et fusion avancee de contacts depuis la revue des doublons.
- Inbox globale "actions du jour".
- Workflow complet de facture.
- Workflow complet d'attestation de vente.
- Module media/photos.
- Module sante complet.
- Matching automatique candidature / portee / animal.

## 18. Exclusions Phase 1

Les exclusions Phase 1 sont encore respectees dans l'etat constate :

- pas de Stripe ;
- pas de Clerk ;
- pas de synchronisation Google Agenda ;
- pas de journal de mise-bas offline-first ;
- pas de lien public tokenise individualise ;
- pas d'envoi email reel ;
- pas de generation PDF/DOCX reelle ;
- pas d'upload documentaire reel ;
- pas de signature electronique ;
- pas de workflow de paiement bancaire automatise.

## 19. Risques et zones floues

### Risques fonctionnels

- Ambiguite entre role `prospect` et absence de role, tous deux affiches comme "Non attribue".
- Multiplication des statuts SQL non encore portes par des workflows UI complets.
- Possible confusion entre `draft` libelle "Demande de pre-reservation" et reservation encore brouillon.
- Paiement `arrhes` utilise pour le versement 250 euros alors que le discours metier distingue encore pre-reservation et arrhes definitives.
- Documents marques comme envoyes ou signes sans fichier reel.

### Risques techniques

- Fichiers volumineux et sensibles :
  - `src/features/reservations/actions.ts` ;
  - `src/app/reservations/[id]/page.tsx` ;
  - `src/app/documents/[id]/page.tsx` ;
  - `src/features/litters/actions.ts` ;
  - `src/features/animals/actions.ts`.
- Logique de roles dupliquee entre candidatures, reservations et paiements.
- Transitions de reservation dispersees.
- Protection des routes privees non totalement centralisee.
- Couplage fort entre libelles UI, statuts SQL et actions serveur.
- Logique SQL de soumission publique et resolution de doublons volontairement transactionnelle mais dupliquee entre plusieurs RPC.

### Hypotheses a verifier

- Sens exact attendu pour `prospect`.
- Statut cible apres paiement complet des 500 euros d'arrhes.
- Conditions metier exactes de consolidation d'une reservation apres naissance.
- Regime juridique du versement 250 euros avant contrat de reservation.
- Role futur du groupe de portees comme axe de priorisation.

## 20. Priorites fonctionnelles recommandees

1. Clarifier le parcours pre-reservation vers reservation consolidee.
2. Clarifier et stabiliser les roles contact, notamment `prospect` / absence de role.
3. Enrichir la revue des doublons avec recherche libre et future fusion manuelle controlee.
4. Transformer le dashboard en liste priorisee d'actions a traiter aujourd'hui.
5. Finaliser le cadrage puis le workflow attestation de vente / facture.

## 21. Priorites de consolidation / refactor

1. Extraire un service metier pour les roles contact.
2. Extraire un service metier pour les transitions reservation/paiement/documents.
3. Centraliser les constantes de statuts et types cote TypeScript.
4. Decouper les pages et actions serveur les plus volumineuses.
5. Uniformiser la protection des routes privees.

## 22. Prochains lots courts recommandes

1. Lot cadrage documentaire : clarifier `prospect`, absence de role et libelles contacts.
2. Lot technique court : centraliser les constantes de roles, statuts et libelles sans changer le modele SQL.
3. Lot workflow : extraire la mise a jour des roles contact dans une fonction/service unique.
4. Lot dashboard : creer une premiere inbox "actions a traiter" basee uniquement sur les donnees existantes.
5. Lot reservation : cadrer puis implementer les conditions d'une reservation consolidee apres 500 euros et documents signes.
6. Lot doublons avance : ajouter recherche libre et cadrage de fusion manuelle sans automatisme destructeur.
7. Lot documents : separer clairement aperçu interne, document attendu, document envoye et fichier reel futur.

# DOC-5K — Audit / cadrage facture

Date : 2026-06-27

## 1. Résumé exécutif

Le modèle actuel sait déjà relier un dossier de vente à une organisation vendeuse, un contact adoptant, une réservation, un animal, une portée, des paiements, des avoirs et des documents métier. Il existe aussi un type documentaire `invoice` dans la contrainte historique des documents et dans les formatters, mais il n'existe pas encore de modèle comptable de facture.

La facture ne doit donc pas être traitée comme un simple document supplémentaire généré depuis `documents`. Elle nécessite au minimum un cadrage séparé sur la numérotation, le statut de brouillon / émission, les montants HT / TVA / TTC ou l'éventuelle franchise, les règles d'annulation / avoir, et la conservation des factures émises.

Conclusion : le socle métier permet de préparer une facture brouillon indicative, mais il n'est pas prêt pour une facture réelle. Le prochain lot recommandé est une étape de décisions métier et comptables avant tout prototype facture.

## 2. Fichiers inspectés

- `AGENTS.md`
- `README.md`
- `docs/PROJECT_LOG.md`
- `docs/DOC-5J_ATTESTATION_VENTE_AUDIT.md`
- `src/types/database.types.ts`
- `supabase/migrations/202606220002_business_schema.sql`
- `supabase/seed.sql`
- `src/features/documents/formatters.ts`
- `src/features/documents/actions.ts`
- `src/features/payments/actions.ts`
- `src/features/reservations/formatters.ts`
- `src/features/reservations/types.ts`
- `src/app/documents/[id]/page.tsx`
- `src/app/reservations/[id]/page.tsx`
- `src/app/settings/organization/page.tsx`
- `src/features/settings/actions.ts`

## 3. Données vendeur / émetteur de la facture

### Données disponibles

Source principale : `organizations`.

- nom commercial : `organizations.name` ;
- raison sociale : `organizations.legal_name` ;
- forme juridique : `organizations.legal_form` ;
- SIRET : `organizations.siret` ;
- adresse : `address_line1`, `address_line2`, `postal_code`, `city`, `country` ;
- email : `organizations.email` ;
- téléphone : `organizations.phone` ;
- site : `organizations.website_url` ;
- affixe : `affix_name`, `dog_affix_name`, `cat_affix_name`.

Source signataire : `organization_representatives`.

- représentant / signataire : `display_name`, `first_name`, `last_name` ;
- qualité du signataire : `representative_role` ;
- coordonnées directes éventuelles : `email`, `phone` ;
- signataire par défaut : `is_default_signatory = true`, `is_active = true`, `deleted_at is null`.

Source paramètres documentaires : `organization_document_settings`.

- mentions légales générales : `legal_mentions` ;
- médiateur : `mediator_name`, `mediator_contact`, `mediator_website_url` ;
- ville de signature par défaut : `signature_city_default` ;
- conditions utiles en contexte vente : `deposit_terms`, `refund_terms`, `credit_terms`, `withholding_terms`, `reservation_contract_terms`.

### Données manquantes ou insuffisantes

- régime fiscal de l'organisation ;
- assujettissement TVA ou franchise en base ;
- numéro de TVA intracommunautaire si applicable ;
- mentions fiscales obligatoires ;
- paramètres de numérotation facture ;
- coordonnées comptables dédiées si différentes des coordonnées publiques ;
- lieu d'émission de facture, distinct de la ville de signature si nécessaire ;
- identité figée de l'émetteur au moment de l'émission.

### Risque si la structure juridique change

Les données `organizations` sont modifiables et représentent l'état courant de l'élevage. Une facture réelle doit conserver l'identité de l'émetteur telle qu'elle était au moment de l'émission. Si Michael passe d'une EI à une EARL, société ou association, une ancienne facture ne doit pas être recalculée avec la nouvelle identité. Cela plaide pour un futur modèle de facture qui snapshotte les informations vendeur.

## 4. Données client / adoptant

Source principale : `contacts`.

### Données disponibles

- nom affichable : `contacts.display_name` ;
- prénom : `contacts.first_name` ;
- nom : `contacts.last_name` ;
- famille / structure : `contacts.family_or_structure_name` ;
- adresse : `address_line1`, `address_line2`, `postal_code`, `city`, `country` ;
- email : `contacts.email` ;
- téléphone : `contacts.phone` ;
- second téléphone : `contacts.secondary_phone` ;
- lien dossier : `contacts -> applications -> reservations`.

### Données manquantes ou incertaines

- identité client figée au moment de facturation ;
- distinction client particulier / professionnel si nécessaire ;
- adresse de facturation distincte de l'adresse de contact ;
- civilité ou information complémentaire si exigée par le modèle futur.

### Risques

Une facture réelle ne devrait pas dépendre uniquement de la fiche contact vivante : l'adresse ou le nom peuvent changer après émission. Comme pour le vendeur, un snapshot client sera probablement nécessaire pour une facture émise.

## 5. Données animal / objet vendu

Sources principales : `animals`, `litters`, `reservation_overview`, `reservations`.

### Données disponibles

Animal :

- nom affichable : `animals.display_name` ;
- nom temporaire, nom d'appel, nom officiel, nom choisi par l'adoptant : `temporary_name`, `call_name`, `official_name`, `chosen_name_by_adopter` ;
- espèce : `species` ;
- race : `breed` ;
- sexe : `sex` ;
- date de naissance : `birth_date` ;
- identification : `identification_number` ;
- LOF : `lof_number` ;
- couleur / collier : `color`, `coat_color`, `collar_color_initial`, `collar_color_current`, `collar_color_note` ;
- portée : `litter_id` ;
- mère / père : `mother_id`, `father_id`.

Portée :

- nom de portée : `litters.name` ;
- race / espèce : `breed`, `species` ;
- date de naissance réelle ou prévue : `actual_birth_date`, `expected_birth_date` ;
- parents : `mother_id`, `father_id`.

Réservation :

- animal attribué : `reservations.animal_id` ;
- portée ou groupe : `litter_id`, `litter_group_id` ;
- espèce / race : `species`, `breed` ;
- sexe souhaité : `reserved_sex_preference`.

### Ce qui peut figurer sur une facture

Pour une facture lisible, le minimum opérationnel serait :

- libellé de vente ;
- espèce ;
- race ;
- nom ou désignation de l'animal ;
- sexe ;
- date de naissance si connue ;
- identification si disponible au moment de l'émission ;
- prix total facturé.

### Ce qui relève plutôt de l'attestation de vente

L'attestation de vente / cession peut porter plus de détails métier :

- filiation mère / père ;
- numéro LOF ;
- informations sanitaires ;
- documents remis ;
- certificat vétérinaire ;
- ICAD ;
- conditions de cession et garanties.

### Données manquantes ou incertaines

- libellé de ligne de facture structuré ;
- description commerciale figée ;
- informations sanitaires structurées ;
- certificat vétérinaire ;
- documents remis à la cession ;
- lien formel vers une future attestation de vente.

## 6. Données financières existantes

Sources : `reservations`, `reservation_overview`, `payments`, `credits`, `credit_usages`, `organization_settings`.

### Données disponibles

Réservation :

- prix total convenu : `reservations.price_cents` ;
- devise : `reservations.currency` ;
- statut dossier : `reservations.status` ;
- dates utiles : `reservation_confirmed_at`, `adoption_planned_at`, `adoption_completed_at` ;
- résolution financière : `financial_resolution`, `financial_resolution_notes`.

Vue `reservation_overview` :

- prix total : `price_cents` ;
- montant payé : `paid_cents` ;
- montant remboursé : `refunded_cents` ;
- devise : `currency` ;
- solde calculable : `price_cents - paid_cents + refunded_cents`.

Paiements :

- montant : `payments.amount_cents` ;
- devise : `currency` ;
- type : `payment_type` ;
- statut : `status` ;
- méthode : `payment_method` ;
- dates : `requested_at`, `due_date`, `paid_at`, `refunded_at` ;
- référence externe : `external_reference` ;
- note : `notes` ;
- liens : `contact_id`, `reservation_id`, `document_id`.

Avoirs :

- `credits.amount_initial_cents`, `amount_remaining_cents`, `currency`, `status`, `issued_at`, `expires_at`, `reason` ;
- lien origine : `origin_payment_id`, `origin_reservation_id` ;
- utilisations : `credit_usages.amount_used_cents`, `target_payment_id`, `target_reservation_id`, `used_at`.

Paramètres :

- prix chiot par défaut : `organization_settings.default_puppy_price_cents` ;
- devise par défaut : `default_currency` ;
- arrhes de pré-réservation : `default_pre_reservation_deposit_cents` ;
- complément d'arrhes : `default_arrhes_second_payment_cents`.

### Compatibilité avec les trois parcours

Parcours A : pré-réservation 2 x 250 EUR.

- Compatible en lecture via plusieurs paiements liés à la réservation ;
- le total payé doit être calculé par agrégation, sans supposer deux lignes obligatoires.

Parcours B : réservation directe avec arrhes 500 EUR.

- Compatible si un paiement unique de 500 EUR est lié à la réservation ;
- la facture future ne doit pas interpréter automatiquement l'absence de paiement 1/2 comme une anomalie.

Parcours C : paiement intégral sans arrhes séparées.

- Compatible si le prix total et les paiements permettent d'identifier un règlement intégral ;
- il faut éviter de forcer les libellés "arrhes" si le paiement est une vente directe.

### Données manquantes ou insuffisantes

- lignes de facture ;
- statut facture : brouillon, émise, annulée, avoir émis ;
- date d'émission ;
- date d'échéance ;
- date de règlement comptable figée ;
- moyen de paiement retenu sur la facture ;
- lien facture vers les paiements inclus ;
- distinction acompte / arrhes / solde / paiement intégral au sens comptable ;
- montant HT ;
- montant TVA ;
- montant TTC ;
- taux de TVA ;
- remise éventuelle ;
- frais éventuels ;
- numéro de facture.

## 7. TVA / mentions fiscales

Le modèle actuel ne contient pas de champs dédiés pour :

- taux de TVA ;
- montant HT ;
- montant TVA ;
- montant TTC distinct ;
- régime fiscal ;
- franchise en base ;
- exonération ;
- mention fiscale obligatoire ;
- numéro de TVA intracommunautaire ;
- date d'émission de facture ;
- date d'échéance de facture ;
- conditions de paiement fiscales ;
- pénalités ou indemnité forfaitaire, si applicable.

Ces points doivent être validés avec Michael et, si nécessaire, avec un conseil comptable / fiscal avant toute facture réelle. Le SaaS ne doit pas décider automatiquement du régime fiscal de l'élevage.

## 8. Numérotation de facture

### État actuel

Le modèle actuel ne permet pas encore :

- un numéro unique de facture ;
- une séquence chronologique ;
- un préfixe annuel ;
- une numérotation par organisation ;
- la garantie d'absence de trou ;
- un état "brouillon" séparé d'une facture émise ;
- une facture non modifiable après émission ;
- un lien formel facture -> réservation ;
- un lien formel facture -> animal ;
- un lien formel facture -> paiements facturés ;
- un lien formel facture -> attestation de vente.

Le type documentaire `invoice` existe dans `documents.document_type` et dans `src/features/documents/formatters.ts`, mais cela ne suffit pas à produire une facture fiable : `documents` est un registre documentaire, pas un journal comptable.

### Risques identifiés

- générer une facture trop tôt, avant prix final ou animal attribué ;
- émettre une facture sans numéro stable ;
- créer des doublons ;
- modifier une facture après émission ;
- supprimer une facture via logique documentaire classique ;
- réutiliser un numéro ;
- mélanger facture, reçu de paiement et attestation de vente ;
- ne pas isoler les séquences en futur SaaS multi-élevages ;
- faire dépendre les anciennes factures de données vendeur/client modifiables.

## 9. Relation facture avec les documents existants

### Ce qui existe

`documents` peut déjà relier un document à :

- `organization_id` ;
- `contact_id` ;
- `application_id` ;
- `reservation_id` ;
- `payment_id` ;
- `litter_id` ;
- `animal_id`.

Les types documentaires incluent déjà :

- `commitment_certificate` ;
- `reservation_contract` ;
- `payment_receipt` ;
- `invoice` ;
- `sale_certificate`.

La page `/documents/[id]` sait afficher une prévisualisation riche des données source, notamment vendeur, signataire, paramètres documentaires, réservation, paiements, portée, parents, animal et documents liés.

### Limites

- aucune action ne crée aujourd'hui un document `invoice` ;
- aucune facture n'est initialisée depuis une réservation ;
- aucun lien "facture officielle" n'existe ;
- aucun modèle ne capture les montants et identités au moment de l'émission ;
- `payment_receipt` peut servir à documenter un paiement, mais ne remplace pas une facture fiscale.

### Relations futures probables

Une future facture pourrait devoir référencer :

- une réservation principale ;
- un contact / client ;
- un animal vendu ;
- un ou plusieurs paiements ;
- un éventuel avoir ;
- une attestation de vente ;
- le certificat d'engagement ;
- le contrat de réservation.

La relation exacte doit être décidée avant migration : facture unique liée à réservation, facture liée à animal, ou facture avec lignes et liens multiples.

## 10. Workflow métier attendu

Options possibles à cadrer :

### Option 1 : facture unique finale

La facture est préparée quand l'animal est attribué, le prix final connu, et la vente effective ou imminente. Elle peut reprendre les paiements déjà effectués et afficher le solde réglé ou restant.

Avantage : plus simple en Phase 1.

Risque : ne couvre pas les cas où Michael souhaite facturer officiellement les arrhes dès leur paiement.

### Option 2 : facture d'arrhes puis facture de solde

Chaque étape financière importante peut avoir sa facture.

Avantage : plus conforme si les arrhes doivent être facturées séparément.

Risque : numérotation, avoirs, annulations et liens paiements deviennent plus sensibles.

### Option 3 : reçu de paiement non fiscal puis facture finale

Les paiements intermédiaires restent des reçus ou suivis internes, puis une facture finale est émise à la vente.

Avantage : compatible avec le modèle actuel qui connaît déjà `payment_receipt`.

Risque : à valider fiscalement selon le statut et les obligations de l'élevage.

### Option 4 : pro forma / brouillon interne

Le SaaS affiche un brouillon de facture non émis, sans numéro définitif.

Avantage : bon candidat pour un futur prototype interne.

Risque : l'UI devra être très claire pour ne pas confondre brouillon et facture réelle.

## 11. Compatibilité SaaS futur multi-élevages

Pour une version commercialisable, la facture devra probablement être paramétrée par organisation :

- identité vendeur par organisation ;
- régime fiscal par organisation ;
- mentions légales par organisation ;
- taux TVA ou franchise par organisation ;
- séquence de numérotation par organisation ;
- rôles autorisés à préparer / émettre / annuler ;
- conservation des factures émises ;
- stratégie d'annulation et d'avoir ;
- stockage documentaire séparé et sécurisé ;
- audit trail des émissions.

Une facture réelle ne doit pas partager une séquence globale entre élevages. Le préfixe, l'année et la chronologie doivent être isolés par `organization_id`.

## 12. Données manquantes ou incertaines

### Modèle facture

- table facture absente ;
- table lignes de facture absente ;
- numéro de facture absent ;
- statut de facture absent ;
- date d'émission absente ;
- date d'échéance absente ;
- snapshot vendeur absent ;
- snapshot client absent ;
- snapshot animal / libellé absent ;
- liens facture -> paiements absents ;
- liens facture -> avoirs absents.

### Fiscalité

- régime fiscal absent ;
- TVA absente ;
- mentions fiscales absentes ;
- conditions de paiement fiscales absentes ;
- validation comptable absente.

### Documents

- type `invoice` présent, mais non utilisé par les actions ;
- aucun document facture seedé ;
- aucun template ;
- aucun fichier ;
- aucun PDF ;
- aucun stockage.

### Métier

- décision facture unique vs facture arrhes + solde absente ;
- moment d'émission absent ;
- relation facture / attestation de vente absente ;
- relation facture / reçu de paiement à clarifier.

## 13. Risques identifiés

- coder une facture comme simple preview documentaire et découvrir ensuite que le modèle comptable est insuffisant ;
- confondre reçu de paiement, facture, avoir et attestation de vente ;
- rigidifier la facture autour du parcours 2 x 250 EUR ;
- ne pas gérer les paiements directs ou intégraux ;
- ne pas figer les données vendeur/client au moment de l'émission ;
- générer un numéro trop tôt ou non chronologique ;
- rendre modifiable une facture déjà émise ;
- négliger les règles TVA / franchise / mentions fiscales ;
- créer une dette importante pour le futur multi-élevages.

## 14. Décisions à faire valider

- facture unique finale ou facture d'arrhes + solde ;
- existence d'un reçu de paiement non fiscal ;
- moment de création du brouillon ;
- moment d'émission officielle ;
- statut déclencheur côté réservation ;
- animal obligatoire ou facture possible avant attribution ;
- numéro attribué au brouillon ou seulement à l'émission ;
- format de numérotation ;
- séquence par année et par organisation ;
- possibilité d'annulation ;
- gestion des avoirs ;
- régime TVA / franchise ;
- mentions fiscales à afficher ;
- rôles autorisés ;
- conservation / archivage ;
- lien obligatoire avec attestation de vente ;
- lien obligatoire avec paiements ;
- texte fiscal à fournir ou valider.

## 15. Recommandation prochain lot

Recommandation : `DOC-5L — Décisions métier facture / attestation`.

Justification :

- l'audit facture révèle des choix fiscaux et de numérotation structurants ;
- un prototype facture brouillon serait possible techniquement, mais risquerait d'embarquer de mauvaises hypothèses ;
- l'attestation de vente reste liée à la facture, au prix final et au paiement intégral ;
- il faut décider si l'attestation peut avancer seule ou si elle doit référencer une facture officielle.

Ordre prudent recommandé :

1. `DOC-5L — Décisions métier facture / attestation` ;
2. `DOC-5M — Prototype interne attestation de vente`, si l'attestation peut rester non fiscale ;
3. `DOC-5N — Prototype interne facture brouillon`, uniquement après décisions sur numérotation, fiscalité et statut brouillon / émis ;
4. lot modèle facture, migration et RLS, à cadrer séparément comme lot sensible.

## 16. Exclusions respectées

- aucun code applicatif modifié ;
- aucune modification UI ;
- aucune génération PDF / DOCX / HTML ;
- aucune facture réelle générée ;
- aucun fichier documentaire réel généré ;
- aucun upload ;
- aucun email ;
- aucune signature électronique ;
- aucune migration ;
- aucune RLS / RPC / policy modifiée ;
- aucune mutation serveur ;
- aucun template définitif ;
- aucun texte fiscal définitif ;
- aucun workflow réservation modifié.

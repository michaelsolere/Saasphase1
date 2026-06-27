# DOC-5J — Audit / cadrage attestation de vente

Date : 2026-06-27

## 1. Résumé exécutif

Le modèle actuel permet déjà de préparer une prévisualisation interne d'attestation de vente / cession à partir d'un dossier adoptant complet : organisation vendeuse, contact adoptant, réservation, paiements, animal attribué, portée, parents et documents liés.

Le point le plus solide est la chaîne `Contact -> Candidature -> Réservation -> Paiements -> Documents -> Animal`. Les derniers lots documentaires ont aussi ajouté les données vendeur / signataire / paramètres documentaires dans `organizations`, `organization_representatives` et `organization_document_settings`.

Les principaux manques avant un prototype robuste concernent la phase finale de vente :

- absence de type documentaire dédié `sale_certificate` / `transfer_certificate` ;
- absence de numéro d'attestation ;
- absence de modèle facture / numéro facture ;
- absence de données sanitaires structurées propres à la cession ;
- absence de liste structurée des documents remis ;
- absence de champs fiscaux / TVA / mentions de facturation ;
- texte juridique et mentions obligatoires non validés.

Conclusion : l'attestation de vente est préparatoire, mais elle touche fortement la facture et les obligations de cession. Le prochain lot recommandé est d'abord un audit facture, avant de prototyper l'attestation.

## 2. Fichiers inspectés

- `AGENTS.md`
- `README.md`
- `docs/PROJECT_LOG.md`
- `src/types/database.types.ts`
- `supabase/migrations/202606220001_core_schema.sql`
- `supabase/migrations/202606220002_business_schema.sql`
- `supabase/migrations/202606220003_workflow_indexes_views_rls.sql`
- `supabase/migrations/202606270001_settings_organization_document_identity.sql`
- `supabase/seed.sql`
- `src/app/documents/[id]/page.tsx`
- `src/features/documents/actions.ts`
- `src/features/documents/formatters.ts`
- `src/app/reservations/[id]/page.tsx`
- `src/app/animals/[id]/page.tsx`
- `src/app/settings/organization/page.tsx`
- `src/features/reservations/actions.ts`
- `src/features/payments/actions.ts`

## 3. Données vendeur / élevage

### Données disponibles

Source principale : `organizations`.

Champs disponibles :

- `organizations.name` : nom commercial / nom affiché ;
- `organizations.legal_name` : raison sociale ;
- `organizations.legal_form` : forme juridique ;
- `organizations.siret` : SIRET ou identifiant légal ;
- `organizations.address_line1`, `address_line2`, `postal_code`, `city`, `country` : adresse ;
- `organizations.email` : email public ;
- `organizations.phone` : téléphone public ;
- `organizations.website_url` : site web ;
- `organizations.affix_name`, `dog_affix_name`, `cat_affix_name` : affixes.

Source signataire : `organization_representatives`.

Champs disponibles :

- `display_name` ;
- `first_name` ;
- `last_name` ;
- `representative_role` ;
- `email` ;
- `phone` ;
- `is_default_signatory` ;
- `is_active` ;
- `deleted_at`.

Source paramètres documentaires : `organization_document_settings`.

Champs disponibles :

- `mediator_name` ;
- `mediator_contact` ;
- `mediator_website_url` ;
- `deposit_terms` ;
- `refund_terms` ;
- `postponement_terms` ;
- `credit_terms` ;
- `withholding_terms` ;
- `reservation_contract_terms` ;
- `commitment_certificate_text` ;
- `legal_mentions` ;
- `signature_city_default`.

### Données manquantes ou incertaines

- aucune donnée fiscale détaillée : régime TVA, assujettissement, mention franchise en base, taux TVA ;
- aucun numéro de facture ;
- aucun numéro d'attestation ;
- pas de conditions de vente finales dédiées ;
- pas de clauses de garanties légales structurées ;
- pas de coordonnées vétérinaires vendeur structurées ;
- pas de texte spécifique attestation de vente.

## 4. Données adoptant

### Données disponibles

Source principale : `contacts`.

Champs disponibles :

- `display_name` ;
- `first_name` ;
- `last_name` ;
- `family_or_structure_name` ;
- `email` ;
- `phone` ;
- `secondary_phone` ;
- `address_line1` ;
- `address_line2` ;
- `postal_code` ;
- `city` ;
- `country` ;
- `internal_comment`.

Liens disponibles :

- `applications.contact_id` ;
- `reservations.contact_id` ;
- `documents.contact_id` ;
- `payments.contact_id`.

### Données manquantes ou risques

- adresse et téléphone peuvent être `null` ;
- l'identité civile complète peut être partielle si seul `display_name` est renseigné ;
- pas de pièce d'identité, date de naissance adoptant ou qualité juridique ;
- pas de validation d'adresse structurée ;
- un contact peut être famille / organisation / autre, ce qui peut nécessiter un libellé adapté dans une attestation.

## 5. Données animal vendu / cédé

### Données disponibles

Source principale : `animals`.

Champs disponibles :

- `display_name` ;
- `temporary_name` ;
- `call_name` ;
- `official_name` ;
- `chosen_name_by_adopter` ;
- `species` ;
- `breed` ;
- `sex` ;
- `birth_date` ;
- `identification_number` ;
- `lof_number` ;
- `official_affix_name` ;
- `color` ;
- `coat_color` ;
- `collar_color_initial` ;
- `collar_color_current` ;
- `collar_color_note` ;
- `litter_id` ;
- `mother_id` ;
- `father_id` ;
- `ownership_status` ;
- `status` ;
- `notes`.

Source portée : `litters`.

Champs disponibles :

- `name` ;
- `species` ;
- `breed` ;
- `actual_birth_date` ;
- `expected_birth_date` ;
- `mother_id` ;
- `father_id` ;
- `litter_group_id` ;
- `status`.

Les parents peuvent être retrouvés via `animals.mother_id`, `animals.father_id` ou via la portée.

### Données sanitaires / documents associés

Le modèle permet de relier des documents à un animal via `documents.animal_id`. Il permet aussi des documents liés à la portée via `documents.litter_id`.

Potentiellement exploitable pour documents sanitaires :

- document vétérinaire lié à l'animal ;
- document vétérinaire lié à la portée ;
- notes ou événements liés à l'animal.

### Données manquantes ou incertaines

- vaccins structurés absents ;
- vermifuges structurés absents ;
- certificat vétérinaire structuré absent ;
- numéro ICAD comme concept distinct absent, même si `identification_number` peut le porter ;
- passeport / carnet de santé non structuré ;
- documents remis non structurés ;
- garanties légales non structurées ;
- informations de stérilisation ou clauses spécifiques absentes.

## 6. Données de vente / cession

### Données disponibles

Source réservation : `reservations`.

Champs disponibles :

- `contact_id` ;
- `application_id` ;
- `animal_id` ;
- `litter_id` ;
- `litter_group_id` ;
- `status` ;
- `price_cents` ;
- `currency` ;
- `adoption_planned_at` ;
- `adoption_completed_at` ;
- `reservation_confirmed_at` ;
- `animal_assigned_at` ;
- `financial_resolution` ;
- `financial_resolution_notes` ;
- `internal_comment`.

Source paiements : `payments`.

Champs disponibles :

- `amount_cents` ;
- `currency` ;
- `payment_type` ;
- `status` ;
- `payment_method` ;
- `requested_at` ;
- `due_date` ;
- `paid_at` ;
- `refunded_at` ;
- `external_reference` ;
- `notes` ;
- `reservation_id` ;
- `document_id`.

Source vue : `reservation_overview`.

Champs utiles :

- `price_cents` ;
- `paid_cents` ;
- `refunded_cents` ;
- `adoption_planned_at` ;
- `adoption_completed_at` ;
- `animal_id` ;
- `animal_display_name` ;
- `contact_display_name` ;
- `litter_name` ;
- `litter_group_name`.

### Données manquantes ou incertaines

- pas de champ distinct `sale_date` ;
- pas de champ distinct `transfer_date` ou `departure_date` ;
- `adoption_completed_at` peut servir à l'adoption finalisée, mais la décision métier doit confirmer si c'est aussi la date de cession effective ;
- pas de numéro d'attestation ;
- pas de facture ou numéro facture ;
- pas de TVA structurée ;
- pas de ligne de vente / ventilation prix, arrhes, solde, accessoires ;
- pas de mode de paiement final unique si plusieurs paiements existent ;
- pas de statut financier documentaire figé au moment de l'attestation.

## 7. Documents associés

### Modèle actuel

Source : `documents`.

Champs utiles :

- `document_type` ;
- `status` ;
- `title` ;
- `contact_id` ;
- `application_id` ;
- `reservation_id` ;
- `payment_id` ;
- `litter_id` ;
- `animal_id` ;
- `sent_at` ;
- `signed_at` ;
- `received_at` ;
- `generated_from_template` ;
- `generated_at` ;
- `file_name` ;
- `file_path` ;
- `signature_required`.

Types existants pertinents :

- `commitment_certificate` ;
- `reservation_contract` ;
- `payment_receipt` ;
- autres documents metadata-only.

Statuts existants :

- `to_generate` ;
- `sent` ;
- `signed` ;
- `received` selon les documents.

### Ce que le modèle permet déjà

Pour une future attestation, on peut retrouver :

- certificat d'engagement lié à la même `reservation_id`, au même `contact_id`, et parfois au même `animal_id` si renseigné ;
- contrat de réservation lié à la même `reservation_id` ;
- date d'envoi du certificat : `documents.sent_at` ;
- date de signature : `documents.signed_at` ;
- statut signé / reçu signé : `documents.status = 'signed'` pour les documents adoptant ;
- délai indicatif de 7 jours : comparaison entre `commitment_certificate.signed_at` ou `sent_at` et `reservations.adoption_planned_at` / `adoption_completed_at`.

### Limites

- aucune relation stricte n'identifie "le" certificat applicable si plusieurs documents existent ;
- pas de type `sale_certificate` dédié ;
- pas de document de facture dédié ;
- `file_path` existe mais la génération / storage ne sont pas encore introduits ;
- pas de liste structurée des documents remis lors de la cession.

## 8. Workflow métier attendu

Moment logique futur pour préparer l'attestation de vente / cession :

1. l'animal est définitivement attribué à la réservation ;
2. l'adoptant est confirmé ;
3. l'identification de l'animal est disponible ;
4. la date de cession / départ est connue ;
5. le prix final est connu ;
6. les paiements sont soldés ou le solde final est prêt à être encaissé ;
7. le certificat d'engagement est délivré / signé dans les délais ;
8. les documents remis sont connus ;
9. les mentions vendeur / signataire / médiateur / garanties sont validées.

Ce lot ne doit pas implémenter ce workflow. Il sert uniquement à cadrer les données nécessaires.

## 9. Compatibilité avec les parcours financiers

La future attestation doit rester compatible avec trois parcours.

### Parcours A : pré-réservation 2 x 250 EUR

Données nécessaires :

- paiements `payment_type = 'arrhes'` ;
- paiements `status = 'paid'` ;
- total net payé via `reservation_overview.paid_cents - refunded_cents` ;
- prix total via `reservations.price_cents`.

L'attestation ne doit pas supposer deux lignes exactes de 250 EUR. Elle peut résumer : arrhes déjà versées, solde, paiement final.

### Parcours B : réservation directe 500 EUR

Données nécessaires :

- paiement d'arrhes unique possible ;
- total net payé >= 500 EUR ;
- absence des statuts 1/2 et 2/2 ne doit pas être une anomalie.

L'attestation doit raisonner en montants payés / solde plutôt qu'en étapes 1/2.

### Parcours C : vente directe avec paiement intégral

Données nécessaires :

- prix total ;
- total net payé ;
- paiement final ;
- date de cession effective ;
- certificat d'engagement signé/délivré au moins 7 jours avant.

L'attestation doit accepter qu'il n'y ait pas d'arrhes séparées.

## 10. Données manquantes ou incertaines

### Modèle documentaire

- type documentaire dédié attestation de vente absent ;
- numéro d'attestation absent ;
- relation formelle attestation -> facture absente ;
- liste des documents remis absente ;
- snapshot des données au moment de la cession absent.

### Modèle vente / facture

- facture absente ;
- numéro facture absent ;
- statut facture absent ;
- TVA / régime fiscal / mentions fiscales absents ;
- lignes de facturation absentes ;
- date de vente distincte absente.

### Modèle sanitaire

- vaccins structurés absents ;
- certificat vétérinaire structuré absent ;
- ICAD distinct absent ;
- vermifuge / traitements / observations vétérinaires structurés absents.

### Contenu juridique

- clauses de vente finales absentes ;
- garanties légales à valider ;
- mentions obligatoires à valider ;
- texte de cession à fournir par Michael ou conseil juridique.

## 11. Risques identifiés

- confondre `adoption_completed_at` avec une date juridique de vente sans validation métier ;
- produire une attestation avant identification de l'animal ;
- rigidifier l'attestation autour du workflow 2 x 250 EUR ;
- considérer un paiement intégral comme forcément lié à des arrhes ;
- mélanger attestation de vente et facture sans cadrer la facture ;
- utiliser des textes juridiques non validés ;
- ne pas figer les données affichées au moment de la cession si elles changent ensuite ;
- ne pas gérer le cas où plusieurs documents `commitment_certificate` ou `reservation_contract` existent pour une même réservation.

## 12. Décisions à faire valider

- nom exact du document : attestation de vente, attestation de cession, certificat de cession, autre ;
- moment exact de préparation ;
- statut ou condition déclencheuse ;
- données obligatoires avant affichage d'un prototype ;
- données seulement recommandées ;
- relation principale : attestation liée à `reservation_id`, `animal_id`, ou les deux ;
- relation à une future facture ;
- nécessité d'un numéro d'attestation ;
- nécessité d'un numéro de facture distinct ;
- date juridique à utiliser : `adoption_completed_at`, nouvelle date de cession, ou autre ;
- documents remis à l'adoptant ;
- texte juridique à fournir ;
- mentions fiscales / TVA à vérifier ;
- nécessité de données sanitaires structurées avant prototype ou seulement en diagnostic.

## 13. Recommandation prochain lot

Recommandation : `DOC-5K — Audit / cadrage facture`.

Raison :

- l'attestation de vente est très liée au prix final, au solde, au paiement intégral et aux mentions fiscales ;
- le modèle actuel n'a ni facture, ni numéro de facture, ni ligne de facturation, ni TVA ;
- un prototype d'attestation sans cadrage facture risque d'embarquer des hypothèses fiscales ou comptables fragiles ;
- un audit facture permettrait ensuite de décider si l'attestation peut rester un document métier séparé, ou si elle doit référencer une facture officielle.

Lot suivant alternatif, seulement après décision : `DOC-5L — Prototype interne attestation de vente`, sans PDF, sans fichier, sans upload, sans signature.

## 14. Exclusions respectées dans cet audit

- aucun code applicatif modifié ;
- aucun prototype UI créé ;
- aucun document réel généré ;
- aucun PDF / DOCX / HTML généré ;
- aucun fichier documentaire réel créé ;
- aucun upload ;
- aucun e-mail ;
- aucune signature électronique ;
- aucun template définitif ;
- aucune migration ;
- aucune modification RLS / RPC / vue SQL / policy ;
- aucune table créée ;
- aucun workflow réservation modifié ;
- aucun statut modifié.

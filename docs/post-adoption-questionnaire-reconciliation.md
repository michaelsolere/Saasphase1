# Réconciliation des questionnaires post-adoption

La migration `202608040001_post_adoption_questionnaire_instance_reconciliation.sql` crée automatiquement les instances T1/T2 lorsqu’une réservation devient `adopted`. Elle fournit aussi une commande bornée pour traiter l’historique et reprendre les cas incomplets.

## Version applicable

- La V1 de chaque questionnaire couvre tout l’historique (`effective_at = -infinity`).
- Une version future reçoit une date d’effet explicite, postérieure ou égale à sa publication.
- La version retenue est la dernière version effective à la date métier `reservations.adoption_completed_at`.
- Une publication ultérieure ne remplace jamais l’instance déjà liée à une adoption.
- Les versions d’une même lignée conservent le même jalon, la même espèce et le même ciblage de race.
- Les définitions et le calendrier publié sont append-only.

## Provisioning automatique

Le trigger de réservation appelle le même moteur que la réconciliation lors :

- d’un `INSERT` déjà adopté ;
- d’une transition vers `status = 'adopted'` ;
- d’une correction des champs d’éligibilité avant toute création d’instance.

Une erreur de provisioning est enregistrée dans `post_adoption_questionnaire_reconciliation_attempts` sans annuler l’adoption. Si la trace durable ne peut pas être écrite, la transaction d’adoption échoue.

Après la création d’une instance, les champs qui fixent son ancre ou son périmètre ne peuvent plus être modifiés silencieusement. Une correction doit faire l’objet d’un workflow explicite et audité.

## Réconciliation opérateur

La RPC est réservée aux membres `owner` ou `admin` actifs de l’organisation :

```sql
select *
from public.reconcile_post_adoption_questionnaire_instances(
  p_organization_id := '<organization-uuid>'::uuid,
  p_client_command_id := '<stable-command-uuid>'::uuid,
  p_batch_size := 100,
  p_after_adoption_completed_at := null,
  p_after_reservation_id := null,
  p_until_adoption_completed_at := null,
  p_until_reservation_id := null
);
```

Règles d’exploitation :

1. Générer un UUID de commande et le conserver avec le journal d’intervention.
2. Commencer sans curseur.
3. La première page capture une borne haute immuable dans `until_adoption_completed_at` / `until_reservation_id`.
4. Si `has_more = true`, lancer une **nouvelle** commande avec un nouvel UUID, les valeurs `next_*` comme paramètres `p_after_*`, et la borne haute inchangée comme paramètres `p_until_*`.
5. Continuer jusqu’à `has_more = false`.
6. Relancer exactement la même commande avec le même UUID après une perte de réponse : le résultat stocké est rejoué sans retraitement.
7. Ne jamais réutiliser un UUID de commande avec un autre batch, un autre curseur ou une autre borne haute ; la RPC renvoie `client_command_conflict`.
8. Examiner les tentatives `missing_data`, `not_eligible`, `inconsistent` et `error` avant toute correction métier.
9. Après correction d’une donnée manquante autorisée, relancer une nouvelle séquence depuis le début ; une correction peut déplacer la réservation dans l’ordre du curseur.

Le curseur et la borne haute sont des couples `(adoption_completed_at, reservation_id)`. Le batch est limité à 100 réservations. Deux workers peuvent exécuter des commandes différentes : les réservations sont verrouillées individuellement et l’unicité par `(organisation, réservation, jalon)` empêche les doublons.

## Audit et sécurité

- `post_adoption_questionnaire_reconciliation_runs` : identité immuable de la commande, source, paramètres, curseur d’entrée et borne haute.
- `post_adoption_questionnaire_reconciliation_run_results` : résultat final immuable utilisé pour le rejeu.
- `post_adoption_questionnaire_reconciliation_attempts` : un résultat immuable par réservation et jalon.
- `post_adoption_questionnaire_events` : création de l’instance et passage éventuel à `due`.

Ces tables sont lisibles uniquement par les `owner` et `admin` actifs de l’organisation. Elles ne sont pas modifiables via les rôles applicatifs. Les suppressions physiques présentes dans les specs E2E sont réservées au cleanup QA sous le compte PostgreSQL de test.

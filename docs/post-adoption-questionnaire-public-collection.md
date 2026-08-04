# Collecte publique des questionnaires post-adoption

Lot `POST-ADOPTION-QUESTIONNAIRE-PUBLIC-COLLECTION-01`.

## Périmètre livré

- création, remplacement et révocation d’un lien public depuis la fiche réservation ;
- échange du jeton opaque contre une session HTTP de deux heures ;
- rendu guidé des définitions T1/T2 publiées ;
- validation progressive dans l’interface et validation autoritative PostgreSQL ;
- première soumission et révisions complètes, atomiques et immuables ;
- idempotence par commande, détection des versions obsolètes et sérialisation des soumissions concurrentes ;
- lecture interne structurée de la dernière révision.

Brevo, les brouillons serveur, la comparaison entre révisions, la revue interne complète, les projections métier et la chronologie unifiée restent hors de ce lot.

## Frontière de sécurité

Le lien contient un jeton aléatoire de 32 octets encodé en base64url. Seul son condensat SHA-256 est persisté. Le jeton est échangé par `GET /suivi/[token]`, puis retiré de l’URL par une redirection relative vers `/suivi/questionnaire`.

La session publique :

- utilise un second jeton aléatoire, lui aussi persisté uniquement sous forme de condensat ;
- expire deux heures après sa création, sans dépasser la fin de lecture publique ;
- est transportée par un cookie `HttpOnly`, `SameSite=Strict`, `Secure` en production ;
- est invalidée immédiatement lors du remplacement ou de la révocation du lien.

Les pages publiques n’exposent que le prénom usuel de l’animal, la définition publiée et les échéances nécessaires. Elles n’exposent ni contact, ni adresse électronique, ni réponse antérieure. Elles appliquent `no-store`, `no-referrer` et `noindex`.

Les tables d’accès, de sessions et de commandes ont la RLS activée. Aucun accès direct n’est accordé à `anon` ou à `service_role`. Le rôle privilégié passe uniquement par les RPC `SECURITY DEFINER` qui lui sont accordées ; les RPC internes vérifient l’appartenance active et le rôle `owner` ou `admin` avant toute mutation. Les mutations directes de `service_role` sont également révoquées sur les réponses et événements métier immuables.

La limitation de débit est partagée dans PostgreSQL plutôt que conservée dans la mémoire d’une instance applicative. L’ouverture combine un plafond global, un bucket d’adresse fourni par le proxy Vercel de confiance et un bucket par jeton ; les soumissions et consultations utilisent le condensat de session. Les buckets sont opaques, privés, atomiques et les entrées inactives sont évincées par lots bornés.

## Soumissions et concurrence

Chaque requête porte :

- un UUID de commande généré côté navigateur ;
- le numéro de révision attendu ;
- une réponse complète ;
- les informations bornées de durée de complétion.

La RPC résout la session puis verrouille toujours l’instance avant l’accès, dans le même ordre que les opérations de remplacement et de révocation. Elle calcule elle-même le condensat canonique de la réponse. Une commande est isolée à sa session : la même commande et la même charge retournent le résultat déjà enregistré dans cette session seulement. Une commande rejouée avec une charge différente est rejetée. Deux commandes concurrentes sur la même révision sont sérialisées : la première crée la révision, la seconde reçoit un conflit et doit recommencer depuis une réponse vide.

En cas de résultat réseau incertain, l’interface consulte d’abord le résultat de la commande existante. Si aucun résultat n’est enregistré, elle rejoue la même commande et la même charge ; elle ne génère pas silencieusement une nouvelle intention.

## Cycle public

- L’écriture reste ouverte jusqu’à `response_deadline_at` (J+30 après invitation).
- La lecture reste possible jusqu’à `public_read_until` (J+60 après invitation).
- Une suspension bloque l’accès sans modifier les échéances.
- Une validation est terminale pour les révisions publiques.
- Une révision repart volontairement d’un formulaire vide et ne montre jamais les réponses précédentes.
- Un lien remplacé ou révoqué retourne le même écran neutre qu’un lien invalide.

## Rétention technique

La RPC service-only `cleanup_post_adoption_questionnaire_public_sessions` supprime par lots de 500 au maximum les sessions expirées depuis plus de 90 jours et leurs commandes d’idempotence. Elle utilise `FOR UPDATE SKIP LOCKED`, supprime les commandes avant les sessions et ne touche jamais aux réponses, aux événements métier ni à l’historique des liens.

## Vérification

Le scénario E2E `tests/e2e/post-adoption-questionnaire-public-collection.spec.ts` couvre notamment :

- privilèges et RLS ;
- échange du lien et session de deux heures ;
- rendu public T1 sans donnée familiale ;
- soumission via la route HTTP ;
- rejeu idempotent et consultation du résultat ;
- conflit de version et concurrence réelle entre deux connexions PostgreSQL ;
- remplacement immédiat du lien ;
- suspension uniforme et isolation des commandes entre sessions ;
- nettoyage borné des sessions et commandes expirées sans suppression des réponses métier ;
- lecture interne de la version courante ;
- hard-delete des fixtures et vérification finale de chaque compteur à zéro.

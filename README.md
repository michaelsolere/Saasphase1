# Saasphase1
Application de gestion d’élevage canin et félin.
Objectif initial : créer un outil personnel pour gérer contacts, candidatures, réservations, portées, chiots, paiements, documents, notes et suivi d’adoption.

Stack prévue :
- Next.js / React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase / PostgreSQL
- Supabase Auth
- Supabase Storage
- Vercel

## Démarrage local

1. Copier `.env.example` vers `.env.local`.
2. Renseigner les variables publiques de l’instance Supabase locale.
3. Installer les dépendances avec `pnpm install`.
4. Démarrer Supabase avec `supabase start`.
5. Démarrer l’application avec `pnpm dev`.

La stack personnelle utilise le projet `saasphase1`. Ne jamais exécuter
`supabase db reset` sur cette stack : cette commande détruirait ses données.

### Compte Auth de développement

Le seed initial fournit un compte strictement fictif :

- email : `owner@saasphase1.invalid`
- mot de passe : `LocalDevOwner-2026!`
- organisation : `elevage-demo`
- rôle : `owner`

Ces identifiants sont publics et réservés au développement local. Ils ne
doivent jamais être réutilisés sur une instance Supabase distante ou en
production.

Commandes de vérification :

```bash
pnpm lint
pnpm build
```

## Développement, E2E automatisé et démonstrations durables

```bash
pnpm dev
pnpm test:e2e
```

`pnpm dev` utilise la stack Supabase locale de développement `saasphase1`,
le port applicatif `3000` et les ports Supabase `54320–54329`.

`pnpm test:e2e` génère un workdir Supabase ignoré pour `saasphase1-e2e`,
utilise l’application sur `127.0.0.1:3100` et les ports Supabase
`55320–55329`, puis arrête uniquement cette stack E2E.

Les démonstrations durables utilisent la même isolation E2E, mais un cycle
explicite distinct de Playwright. Elles conservent le serveur `3100` et leurs
données après la fin de la commande de création, jusqu’au cleanup demandé :

```bash
pnpm demo:e2e:create -- technical-lifecycle
pnpm demo:e2e:status
pnpm demo:e2e:cleanup -- technical-lifecycle
pnpm demo:e2e:stop
```

Tant qu’un manifeste actif existe, `test:e2e`, `test:e2e:reuse` et
`test:e2e:stop` refusent toute opération. Voir
[`docs/E2E_DURABLE_DEMOS.md`](docs/E2E_DURABLE_DEMOS.md) pour le cycle complet.

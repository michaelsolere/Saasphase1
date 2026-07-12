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
5. Réinitialiser la base locale avec `supabase db reset`.
6. Démarrer l’application avec `pnpm dev`.

### Compte Auth de développement

Après chaque `supabase db reset`, un compte strictement fictif est disponible :

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

## Développement et E2E

```bash
pnpm dev
pnpm test:e2e
```

`pnpm dev` utilise la stack Supabase locale de développement `saasphase1`,
le port applicatif `3000` et les ports Supabase `54320–54329`.

`pnpm test:e2e` génère un workdir Supabase ignoré pour `saasphase1-e2e`,
utilise l’application sur `127.0.0.1:3100` et les ports Supabase
`55320–55329`, puis arrête uniquement cette stack E2E.

# Démonstrations E2E durables

Ce cycle sert aux inspections visuelles qui doivent survivre à la commande de
création. Il est distinct des tests Playwright ordinaires et n’utilise que le
projet Supabase `saasphase1-e2e`, les ports `55320–55329` et l’application
`http://127.0.0.1:3100`. Il ne lit ni n’écrit la base personnelle pour créer une
démonstration et ne touche jamais au serveur `3000`.

## Cycle

```bash
# Facultatif : démarrer ou réutiliser prudemment la session sans créer de donnée.
pnpm demo:e2e:start

# Créer explicitement une démonstration et laisser serveur + données actifs.
pnpm demo:e2e:create -- technical-lifecycle

# Créer les deux portées durables du scénario comparatif en une seule commande.
pnpm demo:e2e:create -- growth-comparison

# Afficher l’URL, le PID, le manifeste, l’inventaire et les compteurs réels.
pnpm demo:e2e:status

# Après validation humaine, hard-delete du seul scénario enregistré.
pnpm demo:e2e:cleanup -- technical-lifecycle

# Après validation explicite de la démonstration comparative.
pnpm demo:e2e:cleanup -- growth-comparison

# Possible uniquement lorsqu’aucune démonstration n’est active.
pnpm demo:e2e:stop
```

La création se termine dès que l’application répond HTTP 200. Le processus
Next reste détaché ; son PID, son état et ses logs sont enregistrés dans le
workdir ignoré `.supabase-e2e`. Le manifeste JSON ignoré
`.supabase-e2e/demos/<scenario>.json` est uniquement le registre strict du
cleanup. PostgreSQL demeure la source de vérité et `demo:e2e:status` relit les
compteurs réels.

Le cleanup supprime uniquement les identifiants du manifeste, dans l’ordre
inverse des dépendances. Chaque commande SQL échoue à la première erreur, puis
les tables concernées sont recomptées avec `count(*)`, sans filtre
`deleted_at`. Un reliquat, y compris sous le préfixe réservé du scénario, fait
échouer la commande. Aucun enregistrement seulement soft-delete n’est accepté.

## Protection des démonstrations actives

Un manifeste au statut `active` bloque explicitement :

```bash
pnpm test:e2e
pnpm test:e2e:reuse
pnpm test:e2e:stop
pnpm demo:e2e:stop
```

Il faut toujours passer par `pnpm demo:e2e:cleanup -- <scenario>` avant de
relancer un runner destructif ou d’arrêter la session. Un port occupé sans PID
de démonstration fiable, un PID vivant sans port `3100`, une stack partielle ou
un manifeste illisible provoquent également un refus sans réparation
destructive automatique.

## Scénario croissance et comparaison

`growth-comparison` crée ensemble « Démonstration croissance — Nova × Orion »
et « Démonstration comparaison — Vega × Sirius ». Les deux Journaux sont
accessibles par les URL indiquées dans `pnpm demo:e2e:status`; le comparateur se
trouve sur `/litters/journal/comparison`. Une vérification visuelle en lecture
seule peut être relancée tant que le scénario est actif :

```bash
pnpm demo:e2e:verify:growth
```

Cette vérification ne passe pas par le runner Playwright destructif, ne crée
aucune donnée et contrôle les Journaux, la sélection par nom, les couvertures
réelles `4 / 5`, les profils absolu/relatif et la largeur mobile à 375 px.

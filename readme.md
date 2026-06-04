# Not ready !

# UpdateBoard

Panel web moderne pour analyser automatiquement les containers Docker, detecter les mises a jour disponibles et centraliser les notifications.

## Fonctionnalites

- Scan automatique de tous les containers Docker en execution
- Comparaison de la version installee avec la derniere version disponible
- Planification quotidienne configurable (par defaut: 01:00)
- Scan manuel via le panel
- Notifications multi-canaux:
  - Discord (webhook)
  - Telegram (bot + chat ID)
  - Email (SMTP)
  - Webhook HTTP
- Interface web moderne, claire et responsive
- Persistance des reglages et de l'etat dans `data/`

## Stack technique

- Node.js + Express
- Dockerode (inspection Docker local)
- node-cron (planification)
- semver (comparaison de versions)
- Frontend HTML/CSS/JS (responsive)

## Lancement rapide avec Docker Compose

1. Copier les variables d'environnement:

```bash
cp .env.example .env
```

1. Lancer l'application:

```bash
docker compose up -d --build
```

1. Ouvrir le panel:

```text
http://localhost:8080
```

## Commandes Docker principales

```bash
# Construire et demarrer en arriere-plan
docker compose up -d --build

# Voir les services et leur etat
docker compose ps

# Suivre les logs du service principal
docker compose logs -f app

# Redemarrer uniquement le panel
docker compose restart app

# Ouvrir un shell dans le conteneur app
docker compose exec app sh

# Arreter proprement les services
docker compose stop

# Arreter et supprimer les conteneurs et le reseau
docker compose down

# Arreter, supprimer et nettoyer les volumes persistants
docker compose down -v

# Rebuild propre sans cache
docker compose build --no-cache

# Recupere les images les plus recentes avant de redemarrer
docker compose pull
```

## Commandes utiles du panel

- Lancer un scan manuel depuis le bouton `Lancer un scan`
- Rafraichir l'affichage avec `Rafraichir`
- Exporter la liste visible en JSON avec `Exporter JSON`
- Filtrer les containers avec la recherche et le select `Filtre`

## Variables d'environnement

Voir `.env.example`.

Les variables SMTP sont necessaires uniquement si vous activez les notifications email.

## Lancement local (hors Docker)

1. Installer les dependances:

```bash
npm install
```

1. Demarrer:

```bash
npm start
```

## Fonctionnement de la detection des mises a jour

- Le service lit l'image de chaque container en execution.
- Il interroge le registre pour recuperer la liste des tags.
- Si des tags semver sont disponibles, la version la plus elevee est consideree comme "derniere version".
- Sinon, le systeme tente un fallback sur le tag `latest`.

## Notes importantes

- Le container UpdateBoard doit avoir acces au socket Docker: `/var/run/docker.sock`.
- Certains registres prives peuvent exiger une authentification API specifique (non incluse par defaut).
- Les donnees persistantes sont stockees dans:
  - `data/settings.json`
  - `data/state.json`

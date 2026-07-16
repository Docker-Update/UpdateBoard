# UpdateBoard

Modern web panel allowing to automatically analyze Docker containers, detect available updates and centralize all notifications related to their status.

## Pictures

### Dashboard

![Screenshot](asset/image.png)

---

### Login page

![Screenshot](asset/image2.png)

## Language

French 

## Functionalities

- Automatic scan of all Docker containers in execution
- Comparison of the installed version with the latest version available
- Configurable daily planning (by default: 01:00)
- Manual scan via panel
- Multi-channel notifications:
- Discord (webhook)
- Telegram (bot + chat ID)
- Email (SMTP)
- HTTP Webhook
- Modern, clear and responsive web interface
- Persistence of adjustment and state in `data/`


## Download

### Using docker compose

```yml
services:
  updateboard:
    image: ghcr.io/docker-update/updateboard:latest
    container_name: updateboard
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - TZ=Europe/Paris
      - ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-change-me}
      - SMTP_HOST=${SMTP_HOST:-}
      - SMTP_PORT=${SMTP_PORT:-587}
      - SMTP_USER=${SMTP_USER:-}
      - SMTP_PASS=${SMTP_PASS:-}
      - SMTP_SECURE=${SMTP_SECURE:-false}
      - SMTP_FROM=${SMTP_FROM:-UpdateBoard <noreply@example.com>}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
```

## How update detection works

- The service reads the image of each container in execution.
- He's questioning the registry to retrieve the tag list.
- If semver tags are available, the highest version is considered "last version".
- Otherwise, the system tries a fallback on the tag `latest`.

## Notes importantes

- This project and currently in the creation phase and therefore not finished

## Contributors

<a href="https://github.com/Docker-Update/UpdateBoard/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Docker-Update/UpdateBoard" />
</a>

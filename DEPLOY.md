# 🚀 Déploiement — Afterglow by Kevin
### afterglowbykevin.ch · GitHub → Hostinger VPS · CI/CD automatique

Ce guide te permet de publier le site et de le mettre à jour automatiquement
à chaque sauvegarde depuis l'éditeur (push GitHub). Une fois configuré,
tu n'auras plus rien à faire manuellement.

---

## Vue d'ensemble du pipeline

```
Éditeur (ici) ──push──▶ GitHub (repo "Afterglow") ──Action──▶ VPS Hostinger
                                                                   (git pull)
```

---

## ÉTAPE 1 — Créer le repo GitHub

1. Va sur **github.com/new**
2. Nom du repo : `Afterglow`
3. Visibilité : **Private** (recommandé — le code source reste chez toi)
4. Ne pas initialiser avec un README (on pousse depuis ici)
5. Cliquer **Create repository**
6. Copie l'URL SSH du repo : `git@github.com:Expelliarmus00/Afterglow.git`

---

## ÉTAPE 2 — Connecter l'éditeur à GitHub

Dans l'éditeur (là où tu modifies le site) :

1. Clique sur l'icône **GitHub** dans la barre latérale (ou le bouton Connect)
2. Autorise l'accès à ton compte `Expelliarmus00`
3. Sélectionne le repo `Afterglow`
4. Effectue un premier **push** — tous les fichiers du projet seront envoyés

> Chaque fois que tu enregistres une modification ici, un push vers GitHub
> déclenchera automatiquement le déploiement sur le VPS.

---

## ÉTAPE 3 — Préparer le VPS (SSH)

Connecte-toi à ton VPS Hostinger en SSH :

```bash
ssh root@IP_DE_TON_VPS
# ou
ssh utilisateur@IP_DE_TON_VPS
```

### 3a — Mettre à jour le système

```bash
apt update && apt upgrade -y
```

### 3b — Installer Nginx + PHP + Git

```bash
apt install -y nginx git php8.2-fpm php8.2-cli
```

> Si `php8.2-fpm` n'existe pas, essaie `php8.1-fpm` ou `php-fpm`.
> Pour vérifier la version disponible : `apt-cache search php-fpm`

### 3c — Vérifier que Nginx et PHP tournent

```bash
systemctl status nginx
systemctl status php8.2-fpm
```

Les deux doivent afficher `active (running)`.

---

## ÉTAPE 4 — Générer une clé SSH pour GitHub Actions

Sur le VPS, crée une clé dédiée au déploiement :

```bash
ssh-keygen -t ed25519 -C "github-actions-afterglow" -f ~/.ssh/afterglow_deploy
# Appuyer sur Entrée (pas de passphrase)
```

Ajoute la **clé publique** aux clés autorisées du VPS :

```bash
cat ~/.ssh/afterglow_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Affiche la **clé privée** (tu en auras besoin à l'étape 6) :

```bash
cat ~/.ssh/afterglow_deploy
```

Copie tout le contenu (de `-----BEGIN...` à `...END-----`).

---

## ÉTAPE 5 — Cloner le repo sur le VPS

```bash
# Créer le dossier du site
mkdir -p /var/www/afterglowbykevin.ch

# Cloner le repo (utilise HTTPS la première fois, plus simple)
git clone https://github.com/Expelliarmus00/Afterglow.git /var/www/afterglowbykevin.ch

# Vérifier que les fichiers sont bien là
ls /var/www/afterglowbykevin.ch
```

Si le repo est privé, GitHub te demandera ton nom d'utilisateur et un
**Personal Access Token** (pas ton mot de passe) :
- Va sur github.com → Settings → Developer settings → Personal access tokens
- Génère un token avec le scope `repo`
- Utilise-le comme mot de passe lors du `git clone`

### Configurer git pour les pulls futurs

```bash
cd /var/www/afterglowbykevin.ch
git config pull.rebase false
```

---

## ÉTAPE 6 — Ajouter les secrets GitHub Actions

Dans ton repo GitHub → **Settings** → **Secrets and variables** → **Actions** :

| Nom du secret   | Valeur                                      |
|-----------------|---------------------------------------------|
| `VPS_HOST`      | L'IP de ton VPS (ex: `185.XXX.XXX.XXX`)    |
| `VPS_USER`      | Ton utilisateur SSH (ex: `root` ou `kevin`) |
| `VPS_SSH_KEY`   | La clé privée copiée à l'étape 4            |

> **VPS_SSH_KEY** : colle tout le contenu de la clé privée, y compris
> les lignes `-----BEGIN OPENSSH PRIVATE KEY-----` et `-----END...-----`.

---

## ÉTAPE 7 — Configurer Nginx

Sur le VPS :

```bash
# Copier la config Nginx fournie dans le repo
cp /var/www/afterglowbykevin.ch/nginx.conf /etc/nginx/sites-available/afterglowbykevin.ch

# Activer le site
ln -s /etc/nginx/sites-available/afterglowbykevin.ch /etc/nginx/sites-enabled/

# Désactiver le site par défaut (si présent)
rm -f /etc/nginx/sites-enabled/default

# Vérifier la config
nginx -t

# Recharger Nginx
systemctl reload nginx
```

---

## ÉTAPE 8 — Installer le certificat SSL (HTTPS gratuit)

```bash
apt install -y certbot python3-certbot-nginx

certbot --nginx -d afterglowbykevin.ch -d www.afterglowbykevin.ch
```

Certbot va :
- Te demander ton e-mail (pour les alertes d'expiration)
- Accepter les CGU (Y)
- Mettre à jour automatiquement ta config Nginx pour HTTPS

Le certificat se renouvelle automatiquement. ✅

---

## ÉTAPE 9 — Tester le déploiement automatique

1. Fais une petite modification dans l'éditeur
2. Pousse vers GitHub
3. Va dans ton repo → onglet **Actions**
4. Tu verras le workflow `🚀 Deploy to VPS` s'exécuter
5. Après ~30 secondes, visite **afterglowbykevin.ch** — le changement est en ligne !

---

## ÉTAPE 10 — Vérifier le formulaire de contact

Teste le formulaire sur le site. Si les e-mails n'arrivent pas :

```bash
# Sur le VPS, vérifier que PHP peut envoyer des mails
php -r "mail('test@example.com', 'Test', 'OK');"

# Vérifier les logs PHP
tail -f /var/log/php8.2-fpm.log
tail -f /var/log/nginx/afterglowbykevin.ch.error.log
```

### Option recommandée : SMTP via Hostinger

Hostinger fournit un serveur SMTP avec chaque hébergement.
Pour une meilleure délivrabilité, configure PHPMailer dans `contact.php` :

```bash
# Sur le VPS, installer Composer puis PHPMailer
cd /var/www/afterglowbykevin.ch
curl -sS https://getcomposer.org/installer | php
php composer.phar require phpmailer/phpmailer
```

Les paramètres SMTP Hostinger se trouvent dans **hPanel → Emails → Comptes e-mail**.

---

## Résumé des commandes utiles sur le VPS

```bash
# Mettre à jour manuellement (sans passer par GitHub)
cd /var/www/afterglowbykevin.ch && git pull origin main

# Voir les logs du site
tail -f /var/log/nginx/afterglowbykevin.ch.access.log
tail -f /var/log/nginx/afterglowbykevin.ch.error.log

# Redémarrer les services
systemctl reload nginx
systemctl restart php8.2-fpm

# Vérifier la config Nginx
nginx -t
```

---

## Structure des fichiers déployés

```
/var/www/afterglowbykevin.ch/
├── Kevin Chinelli.html    ← Page d'accueil
├── contact.php            ← Formulaire (envoie à info@snapshotmedia.ch)
├── kc.css / kc-pages.css  ← Styles
├── kc-*.jsx / kc-*.js     ← Scripts
├── *.html                 ← Toutes les pages
├── sitemap.xml
├── robots.txt
├── .github/
│   └── workflows/
│       └── deploy.yml     ← CI/CD GitHub Actions
└── nginx.conf             ← Config Nginx (copiée en étape 7)
```

> Les dossiers `screenshots/`, `scraps/`, `uploads/` et les fichiers
> `Wireframe-*.html` sont ignorés par `.gitignore` et ne sont pas publiés.

---

*Guide généré le 02/06/2026 — Afterglow by Kevin · afterglowbykevin.ch*

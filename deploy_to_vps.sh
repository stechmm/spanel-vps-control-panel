#!/bin/bash

# =================================================================
# NovaPanel One-Click Installer for DigitalOcean VPS (167.172.79.75)
# =================================================================

set -e

echo "🚀 Starting NovaPanel Installation on DigitalOcean VPS..."

# 1. System Updates
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Nginx, MySQL, PHP 8.3, Certbot & Essential Tools
sudo apt-get install -y nginx mysql-server php8.3-fpm php8.3-mysql php8.3-curl php8.3-gd php8.3-mbstring php8.3-xml php8.3-zip certbot python3-certbot-nginx ufw curl git

# 3. Configure UFW Firewall Rules
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5000/tcp
sudo ufw --force enable

# 4. Install Node.js & PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 5. Create Web Root Directory
sudo mkdir -p /var/www/novapanel
sudo chown -R $USER:$USER /var/www/novapanel

echo "✅ Web Server Stack (Nginx, PHP 8.3, MySQL, Node.js) successfully configured!"
echo "✨ Connect NovaPanel to manage your websites & app servers on 167.172.79.75!"

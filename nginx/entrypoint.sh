#!/bin/sh

mkdir -p /etc/nginx/conf.d

if [ -f /etc/nginx/ssl/fullchain.pem ] && [ -f /etc/nginx/ssl/privkey.pem ]; then
    echo "SSL certificates found, enabling HTTPS configuration..."
    # Replace environment variables manually since we aren't using the built-in envsubst mechanism for templates
    envsubst '${DOMAIN_NAME}' < /etc/nginx/templates-available/app.conf.template > /etc/nginx/conf.d/default.conf
else
    echo "SSL certificates NOT found, creating HTTP-only configuration..."
    cat <<EOF > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name ${DOMAIN_NAME};

    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi

# Execute the original entrypoint
exec /docker-entrypoint.sh "$@"

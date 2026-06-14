# ITKC Frontend Runtime Wrapper

This directory stores the repository recovery copy of the production Bun frontend wrapper.

The live systemd service currently runs this wrapper:

    /home/mit/.bun/bin/bun --env-file=/opt/it-knowledge-center/app/.env.local /opt/it-knowledge-center/runtime/itkc-frontend-server.mjs

The wrapper is required because the built TanStack/Bun SSR app must serve hashed frontend assets from:

    /opt/it-knowledge-center/app/dist/client/assets

Without this wrapper static asset branch, browser requests such as `/assets/styles-*.css` and `/assets/*.js` can return 404 and the app shell loads without CSS/JS.

Production live wrapper checksum verified on 2026-06-14:

    208e8b05b2c379b0baa8219b01ded010437bc56d77362e8ce19f003279ba1901

Recovery/install command, if the live wrapper is ever lost:

    sudo mkdir -p /opt/it-knowledge-center/runtime
    sudo cp /opt/it-knowledge-center/app/ops/runtime/itkc-frontend-server.mjs /opt/it-knowledge-center/runtime/itkc-frontend-server.mjs
    sudo chown root:root /opt/it-knowledge-center/runtime/itkc-frontend-server.mjs
    sudo chmod 0644 /opt/it-knowledge-center/runtime/itkc-frontend-server.mjs
    sudo systemctl restart itkc-frontend

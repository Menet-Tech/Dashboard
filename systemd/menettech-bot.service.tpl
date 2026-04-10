[Unit]
Description=Menet-Tech Dashboard Discord bot
After=network.target

[Service]
Type=simple
WorkingDirectory={{ROOT_DIR}}/discord-bot
ExecStart=/usr/bin/npm start
Restart=on-failure
User={{USER}}
Environment=HOME=/home/{{USER}}
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target

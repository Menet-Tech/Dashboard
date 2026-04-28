[Unit]
Description=Menet-Tech Dashboard scheduler
After=network.target

[Service]
Type=simple
WorkingDirectory={{ROOT_DIR}}
ExecStart=/usr/bin/php '{{ROOT_DIR}}/cron/scheduler.php'
Restart=on-failure
User={{USER}}
Environment=HOME=/home/{{USER}}

[Install]
WantedBy=multi-user.target

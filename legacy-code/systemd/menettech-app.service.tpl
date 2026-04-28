[Unit]
Description=Menet-Tech Dashboard built-in PHP web server
After=network.target

[Service]
Type=simple
WorkingDirectory={{ROOT_DIR}}
ExecStart=/usr/bin/php -S 0.0.0.0:8080 '{{ROOT_DIR}}/public/router.php'
Restart=on-failure
User={{USER}}
Environment=HOME=/home/{{USER}}

[Install]
WantedBy=multi-user.target

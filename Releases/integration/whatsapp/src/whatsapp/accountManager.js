const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../utils/logger');
const { setupEvents } = require('./events');

const clients = new Map();

const createAccount = (accountId) => {
    if (clients.has(accountId)) return clients.get(accountId);
    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: `./src/whatsapp/sessions/${accountId}` }),
        puppeteer: { 
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',') : ['--no-sandbox', '--disable-setuid-sandbox'] 
        }
    });
    setupEvents(client, (ready) => {
        // Bisa tambahkan logika per-account
        logger.info(`Account ${accountId} status: ${ready}`);
    }, accountId);
    client.initialize();
    clients.set(accountId, client);
    return client;
};

const getClient = (accountId) => {
    if (!clients.has(accountId)) throw new Error(`Account ${accountId} not found`);
    return clients.get(accountId);
};

const removeAccount = (accountId) => {
    const client = clients.get(accountId);
    if (client) {
        client.destroy();
        clients.delete(accountId);
    }
};

module.exports = { createAccount, getClient, removeAccount };

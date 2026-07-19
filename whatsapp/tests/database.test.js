const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Gateway SQLite database utilities', () => {
    let database;
    let tempDir;

    let originalDbPath;

    beforeAll(() => {
        originalDbPath = process.env.WA_DB_PATH;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-db-test-'));
        process.env.WA_DB_PATH = path.join(tempDir, 'gateway.sqlite');
        jest.resetModules();
        database = require('../src/utils/database');
    });

    afterAll(() => {
        try {
            database.getDb().close();
        } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (originalDbPath) {
            process.env.WA_DB_PATH = originalDbPath;
        } else {
            delete process.env.WA_DB_PATH;
        }
    });

    it('resolveDatabasePath memakai WA_DB_PATH absolut', () => {
        expect(database.resolveDatabasePath()).toBe(path.resolve(process.env.WA_DB_PATH));
    });

    it('menyimpan dan mengambil pesan per account', () => {
        const id = database.saveMessage('6281', 'Halo', 'text', 'wa-1', 'outbound', null, 'billing');
        const message = database.getMessageById(id);

        expect(message.body).toBe('Halo');
        expect(message.account_id).toBe('billing');
        expect(database.getMessages(10, 0, 'billing')).toHaveLength(1);
        expect(database.getMessages(10, 0, 'support')).toHaveLength(0);
    });

    it('mengelola chatbot session', () => {
        database.upsertSession('6281@c.us', 'billing', 'REG_MENU', { customerId: 1 });
        expect(database.getSession('6281@c.us')).toEqual(expect.objectContaining({
            phone: '6281@c.us',
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 1 },
        }));
        expect(database.getAllSessions()).toHaveLength(1);
        database.deleteSession('6281@c.us');
        expect(database.getSession('6281@c.us')).toBeNull();
    });

    it('menyimpan forms dan accounts', () => {
        const formId = database.saveContactForm('registration', '6282@c.us', 'support', { nama: 'Ani' });
        expect(formId).toBeTruthy();
        expect(database.getForms('registration', 10)[0].data.nama).toBe('Ani');

        database.saveAccount('support', 'Support Bot');
        expect(database.getSavedAccounts()).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'support', label: 'Support Bot' }),
        ]));
        database.removeAccount('support');
        expect(database.getSavedAccounts().some((account) => account.id === 'support')).toBe(false);
    });

    it('mengelola auto reply rules', () => {
        const rule = database.saveAutoReplyRule({
            account_id: 'billing',
            keyword: 'rekening',
            reply: 'BCA 123',
            match_type: 'contains',
            priority: 10,
        });
        expect(rule.enabled).toBe(true);
        expect(database.listAutoReplyRules('billing')).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: rule.id, account_id: 'billing' }),
        ]));

        const updated = database.updateAutoReplyRule(rule.id, { enabled: false, reply: 'Mandiri 456' });
        expect(updated.enabled).toBe(false);
        expect(updated.reply).toBe('Mandiri 456');
        expect(database.deleteAutoReplyRule(rule.id).id).toBe(rule.id);
        expect(database.getAutoReplyRule(rule.id)).toBeNull();
    });

    it('mengelola gateway settings', () => {
        database.setGatewaySetting('chatbot_account_id', 'billing');
        expect(database.getGatewaySetting('chatbot_account_id')).toBe('billing');
        expect(database.getGatewaySettings()).toEqual(expect.objectContaining({ chatbot_account_id: 'billing' }));
    });

    it('mengelola scheduled messages persisten', () => {
        const saved = database.saveScheduledMessage({
            id: 'schedule-1',
            accountId: 'billing',
            to: '6281',
            text: 'Reminder',
            type: 'monthly',
            day: 7,
            time: '08:00',
            cronExpr: '0 8 7 * *',
            description: 'Bulanan',
            status: 'active',
        });
        expect(saved.id).toBe('schedule-1');
        expect(database.listActiveScheduledMessages()).toHaveLength(1);

        const updated = database.updateScheduledMessage('schedule-1', {
            status: 'cancelled',
            lastSentAt: '2026-06-06T00:00:00Z',
        });
        expect(updated.status).toBe('cancelled');
        expect(database.listActiveScheduledMessages()).toHaveLength(0);
        expect(database.listScheduledMessages()).toHaveLength(1);
    });
});

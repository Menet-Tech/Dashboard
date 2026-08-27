const express = require('express');
const router = express.Router();
const { postCreateAccount, getAccounts, deleteAccount, getAccountQr, getStatus, getPairingCode } = require('../../controllers/accounts.controller');

/**
 * @swagger
 * /accounts:
 *   post:
 *     summary: Buat akun baru
 *     tags: [Accounts]
 *     responses:
 *       200:
 *         description: Akun berhasil dibuat
 *
 * /accounts/{id}/qr:
 *   get:
 *     summary: Mendapatkan QR Code untuk akun tertentu
 *     tags: [Accounts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Raw string QR di data.qr
 */

router.get('/status', getStatus);
router.post('/', postCreateAccount);
router.get('/', getAccounts);
router.delete('/:id', deleteAccount);
router.get('/:id/qr', getAccountQr);
router.post('/:id/pairing-code', getPairingCode);

// DEBUG route for screenshot
router.get('/:id/debug/screenshot', async (req, res) => {
    try {
        const client = require('../../whatsapp/client').getClient(req.params.id);
        if (!client || !client.pupPage) return res.status(404).send("Client/page not ready");
        const buffer = await client.pupPage.screenshot({ type: 'png' });
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch(e) {
        res.status(500).send(e.toString());
    }
});

// DEBUG route for eval
router.post('/:id/debug/eval', async (req, res) => {
    try {
        const client = require('../../whatsapp/client').getClient(req.params.id);
        if (!client || !client.pupPage) return res.status(404).send("Client/page not ready");
        let result = await client.pupPage.evaluate(req.body.code || "return 'no code'");
        res.json({ result });
    } catch(e) {
        res.status(500).send(e.toString());
    }
});

module.exports = router;

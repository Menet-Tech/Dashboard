const express = require('express');
const router = express.Router();
const { postCreateAccount, getAccounts, deleteAccount, getAccountQr } = require('../../controllers/accounts.controller');

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
router.post('/', postCreateAccount);
router.get('/', getAccounts);
router.delete('/:id', deleteAccount);
router.get('/:id/qr', getAccountQr);

module.exports = router;

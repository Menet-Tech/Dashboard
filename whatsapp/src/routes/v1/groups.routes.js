const express = require('express');
const router = express.Router();
const { postCreateGroup, getGroups, getGroupDetail } = require('../../controllers/groups.controller');
const { validate, createGroupSchema } = require('../../middleware/validator');

/**
 * @swagger
 * tags:
 *   name: Groups
 *   description: Manajemen grup WhatsApp
 *
 * /groups:
 *   post:
 *     summary: Buat grup WhatsApp baru
 *     tags: [Groups]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, participants]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Tim Penjualan"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["6281234567890", "6289876543210"]
 *     responses:
 *       200:
 *         description: Grup berhasil dibuat
 *   get:
 *     summary: Daftar semua grup yang diikuti
 *     tags: [Groups]
 *     responses:
 *       200:
 *         description: Array grup
 *
 * /groups/{id}:
 *   get:
 *     summary: Detail satu grup berdasarkan ID
 *     tags: [Groups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "120363xxxxxx@g.us"
 *     responses:
 *       200:
 *         description: Detail grup
 */
router.post('/', validate(createGroupSchema), postCreateGroup);
router.get('/', getGroups);
router.get('/:id', getGroupDetail);

module.exports = router;

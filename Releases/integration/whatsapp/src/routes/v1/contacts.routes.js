const express = require('express');
const router = express.Router();
const { getAllContacts, getContactDetail, getContactProfilePic, checkIsRegistered } = require('../../controllers/contacts.controller');

/**
 * @swagger
 * tags:
 *   name: Contacts
 *   description: Manajemen kontak WhatsApp
 *
 * /contacts:
 *   get:
 *     summary: Daftar semua kontak
 *     tags: [Contacts]
 *     responses:
 *       200:
 *         description: Array kontak
 *
 * /contacts/{number}:
 *   get:
 *     summary: Detail satu kontak berdasarkan nomor
 *     tags: [Contacts]
 *     parameters:
 *       - in: path
 *         name: number
 *         required: true
 *         schema:
 *           type: string
 *         example: "6281234567890"
 *     responses:
 *       200:
 *         description: Detail kontak
 *
 * /contacts/{number}/profile-picture:
 *   get:
 *     summary: URL foto profil kontak
 *     tags: [Contacts]
 *     parameters:
 *       - in: path
 *         name: number
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: URL foto profil
 *
 * /contacts/{number}/is-registered:
 *   get:
 *     summary: Cek apakah nomor terdaftar di WhatsApp
 *     tags: [Contacts]
 *     parameters:
 *       - in: path
 *         name: number
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status registrasi
 */
router.get('/', getAllContacts);
router.get('/:number', getContactDetail);
router.get('/:number/profile-picture', getContactProfilePic);
router.get('/:number/is-registered', checkIsRegistered);

module.exports = router;

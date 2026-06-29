const { MessageMedia } = require('whatsapp-web.js');

// Service ini bisa digunakan untuk manipulasi atau fetch file eksternal selain yang dihandle oleh utils/fileHandler
const createMediaFromUrl = async (url) => {
    return await MessageMedia.fromUrl(url);
};

module.exports = { createMediaFromUrl };

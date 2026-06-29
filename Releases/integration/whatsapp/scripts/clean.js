const fs = require('fs');
const path = require('path');

const directoriesToClean = [
  path.join(__dirname, '../src/whatsapp/sessions'),
  path.join(__dirname, '../temp'),
  path.join(__dirname, '../logs'),
  path.join(__dirname, '../coverage'),
  path.join(__dirname, '../.wwebjs_auth'),
  path.join(__dirname, '../.wwebjs_cache')
];

const filesToClean = [
  path.join(__dirname, '../wa_gateway.db'),
  path.join(__dirname, '../wa_gateway.db-wal'),
  path.join(__dirname, '../wa_gateway.db-shm'),
];

console.log('🧹 Memulai proses cleanup artefak dan sesi...');

// Hapus isi dalam direktori (tanpa menghapus .gitkeep)
directoriesToClean.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    let deletedCount = 0;
    for (const file of files) {
      if (file === '.gitkeep') continue;
      const fullPath = path.join(dir, file);
      try {
        if (fs.lstatSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        deletedCount++;
      } catch (err) {
        console.error(`❌ Gagal menghapus ${fullPath}:`, err.message);
      }
    }
    if (deletedCount > 0) {
      console.log(`✅ Membersihkan ${deletedCount} item di: ${dir}`);
    }
  }
});

// Hapus file spesifik (seperti database SQLite)
filesToClean.forEach(file => {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`✅ Dihapus: ${file}`);
    } catch (err) {
      console.error(`❌ Gagal menghapus ${file}:`, err.message);
    }
  }
});

console.log('✨ Cleanup selesai!');

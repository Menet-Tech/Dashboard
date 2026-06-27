-- Migration 0030: Add maintenance WA template
INSERT OR IGNORE INTO template_wa (id, nama, trigger_key, isi_template, is_active)
VALUES (5, 'Pemberitahuan Maintenance', 'maintenance', 'Pelanggan Yth, kami informasikan bahwa akan dilakukan pemeliharaan jaringan (maintenance) pada area Anda. Layanan internet mungkin akan mengalami gangguan sementara. Mohon maaf atas ketidaknyamanannya.', 1);

-- Migration 0026: Add trigger_keywords column and insert system chatbot trigger templates
ALTER TABLE template_wa ADD COLUMN trigger_keywords TEXT DEFAULT '';

INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, trigger_keywords, is_active)
VALUES
    ('Chatbot Trigger: Cek Tagihan', 'chatbot_trigger_billing', 'Sistem cek tagihan otomatis.', '1', 1),
    ('Chatbot Trigger: Registrasi', 'chatbot_trigger_register', 'Sistem registrasi mandiri.', '1', 1),
    ('Chatbot Trigger: Lapor Kendala', 'chatbot_trigger_support', 'Sistem laporan kendala teknisi.', '2', 1),
    ('Chatbot Trigger: Daftar Paket', 'chatbot_trigger_packages', 'Sistem daftar paket internet.', '3', 1),
    ('Chatbot Trigger: Pertanyaan Umum', 'chatbot_trigger_faq', 'Sistem tanya jawab FAQ.', '4', 1),
    ('Chatbot Trigger: Hubungi Admin', 'chatbot_trigger_admin', 'Sistem hubungi CS/admin.', '5', 1);

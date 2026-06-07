-- Migration 0014: Add custom chatbot menu templates for unregistered and registered users
INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active)
VALUES
    ('Chatbot: Menu Pelanggan Baru (Unregistered)', 'chatbot_menu_unreg', 'hai, selamat datang di menet dashboard, silahkan ikuti panduan tersebut:
kirim {trigger_register} untuk mendaftar, dan menggunakan internet menet
kirim {trigger_support} jika ada kendala mengenai wifi
kirim {trigger_packages} untuk melihat paket yang disediakan
kirim {trigger_faq} untuk melihat pertanyaan umum
kirim {trigger_admin} untuk chat ke admin', 1),
    ('Chatbot: Menu Pelanggan Terdaftar (Registered)', 'chatbot_menu_reg', 'hai, selamat {greeting} {nama}, apa ada yang bisa di bantu ?
ketik {trigger_billing} untuk cek tagihan anda
ketik {trigger_support} jika ada kendala mengenai wifi
kirim {trigger_packages} untuk melihat paket yang disediakan
kirim {trigger_faq} untuk melihat pertanyaan umum
kirim {trigger_admin} untuk chat ke admin', 1);

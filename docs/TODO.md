# Kerjain Secepetnya 
- [x] tambahin waktu bikin ppp profile, tambahin flag di queue -> Queue type Rx nya codel-down dan Tx nya codel-up (buat default, bikin aja hardcoded soalnya waktu kita bikin ppp profile dia udah pasti ada gitu flag ini)
- [x] Bnenerin deteksi konfirmasi pembayaran
- [x] bug saat konversi, jadi saat mau konversi, aku tekan konversi 3 kali dengan cepat, saat kita cek di pelanggan dia masuk 3 akun padahal seharusnya 1, intinya harus di double check di database apa benar akun ini sudah ada atau belum
- [x] benerin bug `• Pengirim: . (168096899829931@lid)`, masa nomernya gak bisa di baca
# Penting
- [x] Client kirim bukti pembayaran -> buat ticket pembayaran -> redirect foto ke Admin dengan detail customer -> nunggu admin bales -> acc -> ticket close -> message user
- [x] perbaiki bug Trial saat konversi dari registrasi list ke pelanggan, harusnya waktu di konversi dia bakal masuk ke mode trial, ini tidak
- [x] pelanggan yang udah limit, terus kita active manual di dashboard berarti dia gak bakal balik lagi ke ppp user limit, tetep dia belom bayar, statusnya tetep ke limit, tapi di profile dia bakal balik lagi ke kouta asli dia, itu kalo kita edit manual ya, di page pelanggan bagian status layanan

# lumayan ke pake
- [x] di registrasi list waktu di pencet namanya muncul detail registrasinya

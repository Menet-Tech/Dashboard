<?php
/**
 * WhatsApp Helper
 * Fungsi untuk membangun pesan WA dari template dan membuat wa.me link
 */

/**
 * Ambil setting dari tabel app_settings
 */
function getAppSetting($conn, $key, $default = '') {
    $stmt = $conn->prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?");
    $stmt->bind_param("s", $key);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();
    return $row ? ($row['setting_value'] ?? $default) : $default;
}

/**
 * Ambil template WA berdasarkan jenis
 * @param mysqli $conn
 * @param string $jenis 'tagihan' | 'pembayaran' | 'peringatan'
 * @return array|null
 */
function getWATemplate($conn, $jenis) {
    $stmt = $conn->prepare("SELECT * FROM wa_templates WHERE jenis = ?");
    $stmt->bind_param("s", $jenis);
    $stmt->execute();
    $result = $stmt->get_result();
    $template = $result->fetch_assoc();
    $stmt->close();
    return $template;
}

/**
 * Build pesan WA dengan mengganti variabel di template
 * @param string $template_text  Isi template dengan variabel {xxx}
 * @param array  $data           Data untuk mengganti variabel
 * @return string
 */
function buildWAMessage($template_text, $data) {
    $replacements = [
        '{nama}'          => $data['nama'] ?? '',
        '{no_wa}'         => $data['no_wa'] ?? '',
        '{paket}'         => $data['paket'] ?? '',
        '{harga}'         => isset($data['harga']) ? number_format($data['harga'], 0, ',', '.') : '',
        '{bulan}'         => $data['bulan'] ?? '',
        '{jatuh_tempo}'   => $data['jatuh_tempo'] ?? '',
        '{tanggal_bayar}' => $data['tanggal_bayar'] ?? '-',
        '{nama_isp}'      => $data['nama_isp'] ?? 'ISP',
        '{no_rekening}'   => $data['no_rekening'] ?? '-',
    ];

    return str_replace(array_keys($replacements), array_values($replacements), $template_text);
}

/**
 * Build wa.me URL dari nomor WA dan teks pesan
 * @param string $no_wa  Nomor WA (bisa format 08xx atau 628xx atau +628xx)
 * @param string $pesan  Teks pesan WA
 * @return string        URL wa.me
 */
function buildWALink($no_wa, $pesan) {
    // Normalisasi nomor: hapus karakter non-digit, pastikan diawali 62
    $no_wa = preg_replace('/[^0-9]/', '', $no_wa);
    if (substr($no_wa, 0, 1) === '0') {
        $no_wa = '62' . substr($no_wa, 1);
    }
    if (substr($no_wa, 0, 2) !== '62') {
        $no_wa = '62' . $no_wa;
    }

    return 'https://wa.me/' . $no_wa . '?text=' . urlencode($pesan);
}

/**
 * Build wa.me link langsung dari tagihan_id dan jenis template
 * @param mysqli $conn
 * @param int    $tagihan_id
 * @param string $jenis 'tagihan' | 'pembayaran' | 'peringatan'
 * @return string|null  URL wa.me atau null jika data tidak lengkap
 */
function buildWALinkFromTagihan($conn, $tagihan_id, $jenis) {
    // Ambil data tagihan + pelanggan + paket
    $sql = "SELECT 
                t.id, t.tanggal_jatuh_tempo, t.tanggal_bayar, t.tanggal_tagihan,
                p.nama, p.no_wa, p.paket_id,
                pb.name as paket_name, pb.price
            FROM tagihan t
            JOIN pelanggan p ON t.pelanggan_id = p.id
            JOIN paket_bandwidth pb ON p.paket_id = pb.id
            WHERE t.id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $tagihan_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $tagihan = $result->fetch_assoc();
    $stmt->close();

    if (!$tagihan || empty($tagihan['no_wa'])) return null;

    // Ambil settings
    $nama_isp   = getAppSetting($conn, 'nama_isp', 'ISP');
    $no_rek     = getAppSetting($conn, 'nomor_rekening', '-');

    // Ambil template
    $template = getWATemplate($conn, $jenis);
    if (!$template) return null;

    // Format bulan dalam Bahasa Indonesia
    $bulan_names = ['Januari','Februari','Maret','April','Mei','Juni',
                    'Juli','Agustus','September','Oktober','November','Desember'];
    $bulan_num = (int) date('n', strtotime($tagihan['tanggal_tagihan']));
    $tahun     = date('Y', strtotime($tagihan['tanggal_tagihan']));
    $bulan_str = $bulan_names[$bulan_num - 1] . ' ' . $tahun;

    $data = [
        'nama'          => $tagihan['nama'],
        'no_wa'         => $tagihan['no_wa'],
        'paket'         => $tagihan['paket_name'],
        'harga'         => $tagihan['price'],
        'bulan'         => $bulan_str,
        'jatuh_tempo'   => date('d/m/Y', strtotime($tagihan['tanggal_jatuh_tempo'])),
        'tanggal_bayar' => $tagihan['tanggal_bayar']
                            ? date('d/m/Y', strtotime($tagihan['tanggal_bayar']))
                            : '-',
        'nama_isp'      => $nama_isp,
        'no_rekening'   => $no_rek,
    ];

    $pesan = buildWAMessage($template['isi_pesan'], $data);
    return buildWALink($tagihan['no_wa'], $pesan);
}

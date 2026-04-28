<?php

declare(strict_types=1);

namespace App\Models;

class TemplateWA extends BaseModel
{
    public function all(): array
    {
        return $this->db->query('SELECT * FROM template_wa ORDER BY trigger_event ASC')->fetchAll();
    }

    public static function getByTrigger(string $trigger): ?array
    {
        $instance = new self();
        $stmt = $instance->db->prepare('SELECT * FROM template_wa WHERE trigger_event = :trigger AND is_active = 1 LIMIT 1');
        $stmt->execute(['trigger' => $trigger]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function save(array $data): void
    {
        if (!empty($data['id'])) {
            $stmt = $this->db->prepare(
                'UPDATE template_wa SET nama = :nama, trigger_event = :trigger_event, isi_pesan = :isi_pesan, is_active = :is_active WHERE id = :id'
            );
            $stmt->execute([
                'id' => (int) $data['id'],
                'nama' => (string) $data['nama'],
                'trigger_event' => (string) $data['trigger_event'],
                'isi_pesan' => (string) $data['isi_pesan'],
                'is_active' => (int) $data['is_active'],
            ]);
            return;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO template_wa (nama, trigger_event, isi_pesan, is_active) VALUES (:nama, :trigger_event, :isi_pesan, :is_active)'
        );
        $stmt->execute([
            'nama' => (string) $data['nama'],
            'trigger_event' => (string) $data['trigger_event'],
            'isi_pesan' => (string) $data['isi_pesan'],
            'is_active' => (int) $data['is_active'],
        ]);
    }

    public function delete(int $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM template_wa WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    public function existsTrigger(string $trigger, ?int $ignoreId = null): bool
    {
        $sql = 'SELECT COUNT(*) FROM template_wa WHERE trigger_event = :trigger';
        $params = ['trigger' => $trigger];
        if ($ignoreId !== null) {
            $sql .= ' AND id != :id';
            $params['id'] = $ignoreId;
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return (int) $stmt->fetchColumn() > 0;
    }

    public static function parse(string $template, array $context): string
    {
        $periode = !empty($context['periode']) ? date('F Y', strtotime((string) $context['periode'])) : '-';
        $resolvedDueDate = !empty($context['tgl_jatuh_tempo'])
            ? Pelanggan::resolveDueDateFromStored((string) $context['tgl_jatuh_tempo'], $context['periode'] ?? null)
            : null;
        $jatuhTempo = $resolvedDueDate ? date('d/m/Y', strtotime($resolvedDueDate)) : '-';
        $tanggalBayar = !empty($context['tgl_bayar']) ? date('d/m/Y H:i', strtotime((string) $context['tgl_bayar'])) : '-';
        $invoiceNumber = $context['invoice_number'] ?? Tagihan::generateInvoiceNumber($context);
        $statusPembayaran = Tagihan::displayStatusLabel((string) ($context['display_status'] ?? $context['status'] ?? 'belum_bayar'));

        return strtr($template, [
            '{nama}' => $context['nama'] ?? '-',
            '{no_wa}' => $context['no_wa'] ?? '-',
            '{paket}' => $context['nama_paket'] ?? '-',
            '{harga}' => number_format((float) ($context['harga'] ?? 0), 0, ',', '.'),
            '{bulan}' => $periode,
            '{periode}' => $periode,
            '{jatuh_tempo}' => $jatuhTempo,
            '{tgl_jatuh_tempo}' => $jatuhTempo,
            '{tanggal_bayar}' => $tanggalBayar,
            '{invoice_number}' => $invoiceNumber,
            '{status_pembayaran}' => $statusPembayaran,
            '{hari_limit}' => Pengaturan::get('billing_limit_after_days', '5'),
            '{nama_isp}' => Pengaturan::get('nama_isp', 'Menet-Tech'),
            '{no_rekening}' => Pengaturan::get('no_rekening', '-'),
        ]);
    }
}

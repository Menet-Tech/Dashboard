<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Models\Report;

class ReportController extends Controller
{
    public function index(): void
    {
        $report = new Report();
        $this->view('laporan/index', [
            'title' => 'Laporan Operasional',
            'monthlyIncome' => $report->monthlyIncome(),
            'outstandingCustomers' => $report->outstandingCustomers(),
            'dueThisWeek' => $report->dueThisWeek(),
            'longestOverdue' => $report->longestOverdue(),
        ]);
    }

    public function export(): void
    {
        $type = (string) $this->input('type', 'monthly-income');
        $report = new Report();

        $dataset = match ($type) {
            'outstanding' => $report->outstandingCustomers(),
            'due-this-week' => $report->dueThisWeek(),
            'longest-overdue' => $report->longestOverdue(),
            default => $report->monthlyIncome(),
        };

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="laporan-' . $type . '-' . date('Ymd-His') . '.csv"');

        $output = fopen('php://output', 'wb');
        if ($output === false) {
            exit('Tidak dapat membuat file export.');
        }

        if ($dataset !== []) {
            fputcsv($output, array_keys($dataset[0]));
            foreach ($dataset as $row) {
                fputcsv($output, array_map(static fn ($value) => is_scalar($value) || $value === null ? $value : json_encode($value), $row));
            }
        }
        fclose($output);
        exit;
    }
}

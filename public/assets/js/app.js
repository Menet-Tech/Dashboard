document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.copy-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      await navigator.clipboard.writeText(button.dataset.copy || '');
      Swal.fire({ icon: 'success', title: 'SN ONT disalin', timer: 1300, showConfirmButton: false });
    });
  });

  document.querySelectorAll('.confirm-delete').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const form = button.closest('form');
      Swal.fire({ icon: 'warning', title: 'Hapus data ini?', showCancelButton: true, confirmButtonText: 'Ya, hapus' }).then((result) => {
        if (result.isConfirmed) form.submit();
      });
    });
  });

  if (document.querySelector('.datatable')) $('.datatable').DataTable({ pageLength: 10, order: [] });

  if (window.dashboardChart && document.getElementById('incomeChart')) {
    const formatter = new Intl.NumberFormat('id-ID');
    const labels = window.dashboardChart.map((item) => {
      const [year, month] = String(item.bulan).split('-');
      return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    });
    new Chart(document.getElementById('incomeChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Pendapatan Terkumpul',
            data: window.dashboardChart.map((item) => Number(item.pendapatan_terkumpul || 0)),
            borderRadius: 12,
            maxBarThickness: 42,
            backgroundColor: '#0f766e'
          },
          {
            type: 'line',
            label: 'Potensi Pendapatan',
            data: window.dashboardChart.map((item) => Number(item.potensi_pendapatan || 0)),
            borderColor: '#e08e27',
            backgroundColor: 'rgba(224, 142, 39, 0.15)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'start' },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: Rp ${formatter.format(Number(context.parsed.y || 0))}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return `Rp ${formatter.format(Number(value))}`;
              }
            }
          }
        }
      }
    });
  }

  if (document.getElementById('pickerMap')) {
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const map = L.map('pickerMap').setView([Number(latInput.value || -6.2), Number(lngInput.value || 106.8)], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    const marker = L.marker([Number(latInput.value || -6.2), Number(lngInput.value || 106.8)], { draggable: true }).addTo(map);
    marker.on('dragend', () => { const p = marker.getLatLng(); latInput.value = p.lat.toFixed(8); lngInput.value = p.lng.toFixed(8); });
    map.on('click', (event) => { marker.setLatLng(event.latlng); latInput.value = event.latlng.lat.toFixed(8); lngInput.value = event.latlng.lng.toFixed(8); });
  }

  if (window.customerMapData && document.getElementById('customerMap')) {
    const points = window.customerMapData.filter((item) => item.latitude && item.longitude);
    const map = L.map('customerMap').setView(points.length ? [points[0].latitude, points[0].longitude] : [-6.2, 106.8], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    const colors = { green: '#16a34a', yellow: '#d97706', red: '#dc2626', gray: '#6b7280' };
    points.forEach((item) => {
      const icon = L.divIcon({ className: 'custom-pin', html: `<span style="display:block;width:16px;height:16px;border-radius:999px;background:${colors[item.marker_color] || '#0f766e'};border:3px solid white;box-shadow:0 8px 16px rgba(0,0,0,.18)"></span>` });
      const popup = `<strong>${item.nama}</strong><br>${item.nama_paket}<br>SN ONT: ${item.sn_ont || '-'}<br><button class="btn btn-sm btn-outline-secondary mt-2" onclick="navigator.clipboard.writeText('${item.sn_ont || ''}')">Copy SN</button>`;
      L.marker([item.latitude, item.longitude], { icon }).addTo(map).bindPopup(popup);
    });
  }

  const csrf = document.querySelector('input[name="_token"]')?.value || '';
  document.querySelectorAll('.ajax-paid').forEach((button) => {
    button.addEventListener('click', async () => {
      const response = await fetch(`${window.APP_URL}/tagihan/lunas`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _token: csrf, id: button.dataset.id }) });
      const result = await response.json();
      Swal.fire({ icon: result.success ? 'success' : 'error', title: result.message }).then(() => location.reload());
    });
  });
  document.querySelectorAll('.ajax-redo').forEach((button) => {
    button.addEventListener('click', async () => {
      const response = await fetch(`${window.APP_URL}/tagihan/redo`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _token: csrf, id: button.dataset.id }) });
      const result = await response.json();
      Swal.fire({ icon: result.success ? 'success' : 'error', title: result.message }).then(() => location.reload());
    });
  });
  document.querySelectorAll('.ajax-wa').forEach((button) => {
    button.addEventListener('click', async () => {
      const response = await fetch(`${window.APP_URL}/tagihan/send-wa`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _token: csrf, id: button.dataset.id, trigger: button.dataset.trigger || 'jatuh_tempo' }) });
      const result = await response.json();
      if (!result.success && result.fallback_url) window.open(result.fallback_url, '_blank');
      Swal.fire({ icon: result.success ? 'success' : 'warning', title: result.message || 'Selesai' });
    });
  });
});

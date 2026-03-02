// Tambahkan fungsi khusus untuk halaman pool dan paket
document.addEventListener('DOMContentLoaded', function() {
    // Tampilkan tanggal dan waktu saat ini
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        dateElement.textContent = now.toLocaleDateString('id-ID', options);
    }

    // Efek hover pada notifikasi
    const notifications = document.querySelector('.notifications');
    if (notifications) {
        notifications.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px) scale(1.02)';
        });
        
        notifications.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    }

    // Dropdown menu functionality
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
        const link = item.querySelector('.sidebar-link');
        const dropdownMenu = item.querySelector('.dropdown-menu');
        
        if (link && dropdownMenu) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const isActive = item.classList.contains('active');
                
                // Tutup semua dropdown lain
                dropdownItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('active');
                    }
                });
                
                // Toggle dropdown ini
                if (isActive) {
                    item.classList.remove('active');
                } else {
                    item.classList.add('active');
                }
            });
        }
    });

    // Tutup dropdown saat klik di luar
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown-item')) {
            dropdownItems.forEach(item => {
                item.classList.remove('active');
            });
        }
    });

    // Event delegation untuk tombol edit dan delete
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('btn-edit')) {
            e.preventDefault();
            const row = e.target.closest('.pool-row');
            if (row) {
                // Cek apakah ini tombol edit untuk pool atau paket
                const poolName = row.querySelector('.pool-name').textContent.trim();
                const poolRange = row.querySelector('.pool-range').textContent.trim();
                
                // Jika ini pool, gunakan logika pool
                if (poolRange.includes('-')) {
                    const [startIP, endIP] = poolRange.split('-');
                    
                    // Ambil ID dari data attribute atau cari dari database
                    const poolId = row.getAttribute('data-id') || (index + 1);
                    
                    // Isi form edit
                    document.getElementById('edit-name').value = poolName;
                    document.getElementById('edit-start-ip').value = startIP.trim();
                    document.getElementById('edit-end-ip').value = endIP.trim();
                    document.getElementById('edit-id').value = poolId;
                    
                    // Tampilkan form edit
                    showEditForm();
                } else {
                    // Ini adalah paket, gunakan logika paket
                    const localAddress = poolRange;
                    const remoteAddress = row.querySelector('.pool-next').textContent.trim();
                    const speedLimit = row.querySelector('.pool-comment').textContent.trim();
                    
                    // Ambil ID dari data attribute
                    const paketId = row.getAttribute('data-id');
                    
                    // Isi form edit
                    document.getElementById('edit-name').value = poolName;
                    document.getElementById('edit-local-address').value = localAddress;
                    
                    // Set remote address di dropdown
                    const remoteSelect = document.getElementById('edit-remote-address');
                    for (let i = 0; i < remoteSelect.options.length; i++) {
                        if (remoteSelect.options[i].value === remoteAddress) {
                            remoteSelect.selectedIndex = i;
                            break;
                        }
                    }
                    
                    document.getElementById('edit-speed-limit').value = speedLimit;
                    document.getElementById('edit-id').value = paketId;
                    
                    // Tampilkan form edit
                    showEditForm();
                }
            }
        }
        
        if (e.target && e.target.classList.contains('btn-delete')) {
            e.preventDefault();
            const row = e.target.closest('.pool-row');
            if (row) {
                // Cek apakah ini tombol delete untuk pool atau paket
                const poolName = row.querySelector('.pool-name').textContent.trim();
                const poolRange = row.querySelector('.pool-range').textContent.trim();
                
                // Jika ini pool, gunakan logika pool
                if (poolRange.includes('-')) {
                    // Ambil ID dari data attribute atau cari dari database
                    const poolId = row.getAttribute('data-id') || (index + 1);
                    
                    // Set nama pool di modal
                    document.getElementById('delete-pool-name').textContent = poolName;
                    
                    // Simpan ID untuk delete
                    document.getElementById('confirm-delete-btn').onclick = function() {
                        deletePool(poolId);
                    };
                    
                    // Tampilkan modal delete
                    showDeleteModal();
                } else {
                    // Ini adalah paket, gunakan logika paket
                    // Ambil ID dari data attribute
                    const paketId = row.getAttribute('data-id');
                    
                    // Set nama paket di modal
                    document.getElementById('delete-paket-name').textContent = poolName;
                    
                    // Simpan ID untuk delete
                    document.getElementById('confirm-delete-btn').onclick = function() {
                        deletePaket(paketId);
                    };
                    
                    // Tampilkan modal delete
                    showDeleteModal();
                }
            }
        }
    });

    // Validasi form tambah (Pool)
    if (document.getElementById('add-pool-form')) {
        document.getElementById('add-pool-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('add-name').value.trim();
            const startIP = document.getElementById('add-start-ip').value.trim();
            const endIP = document.getElementById('add-end-ip').value.trim();

            const errorDiv = document.getElementById('add-pool-error');
            
            if (!validateIP(startIP) || !validateIP(endIP)) {
                console.error('Format IP address tidak valid!');
                if (errorDiv) {
                    errorDiv.textContent = 'Format IP address tidak valid!';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            // Submit via AJAX
            const formData = new FormData();
            formData.append('action', 'add');
            formData.append('name', name);
            formData.append('start_ip', startIP);
            formData.append('end_ip', endIP);

            fetch('process_pool.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (errorDiv) {
                        errorDiv.textContent = '';
                        errorDiv.style.display = 'none';
                    }
                    hideAddForm();
                    refreshPools();
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = data.message || 'Terjadi kesalahan.';
                        errorDiv.style.display = 'block';
                    }
                }
            })
            .catch(error => {
                console.error('Error:', error);
                if (errorDiv) {
                    errorDiv.textContent = 'Gagal menghubungi server.';
                    errorDiv.style.display = 'block';
                }
            });
        });
    }

    // Validasi form edit (Pool)
    if (document.getElementById('edit-pool-form')) {
        document.getElementById('edit-pool-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const id = document.getElementById('edit-id').value;
            const name = document.getElementById('edit-name').value.trim();
            const startIP = document.getElementById('edit-start-ip').value.trim();
            const endIP = document.getElementById('edit-end-ip').value.trim();

            if (!validateIP(startIP) || !validateIP(endIP)) {
                console.error('Format IP address tidak valid!');
                return;
            }

            // Submit via AJAX
            const formData = new FormData();
            formData.append('action', 'edit');
            formData.append('id', id);
            formData.append('name', name);
            formData.append('start_ip', startIP);
            formData.append('end_ip', endIP);

            fetch('process_pool.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    hideEditForm();
                    refreshPools();
                } else {
                    console.error('Error:', data.message);
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        });
    }

    // Validasi form tambah (Paket) - HAPUS FUNGSI INI KARENA FORM SUDAH PAKAI SUBMIT LANGSUNG

    // Event listener untuk dropdown remote address (tambah)
    if (document.getElementById('add-remote-address')) {
        document.getElementById('add-remote-address').addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const startIP = selectedOption.getAttribute('data-start-ip');
            
            if (startIP) {
                const localAddress = generateLocalAddress(startIP);
                document.getElementById('add-local-address').value = localAddress;
            }
        });
    }

    // Event listener untuk dropdown remote address (edit)
    if (document.getElementById('edit-remote-address')) {
        document.getElementById('edit-remote-address').addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const startIP = selectedOption.getAttribute('data-start-ip');
            
            if (startIP) {
                const localAddress = generateLocalAddress(startIP);
                document.getElementById('edit-local-address').value = localAddress;
            }
        });
    }

    // Validasi form edit (Paket) - HAPUS FUNGSI INI KARENA FORM SUDAH PAKAI SUBMIT LANGSUNG
});

// Fungsi validasi IP address
function validateIP(ip) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    
    const parts = ip.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255);
}

// Fungsi untuk generate local address dari start IP
function generateLocalAddress(startIP) {
    const parts = startIP.split('.');
    if (parts.length === 4) {
        parts[3] = '254';
        return parts.join('.');
    }
    return startIP;
}

// Fungsi validasi range IP
function validateIPRange(startIP, endIP) {
    const start = ip2long(startIP);
    const end = ip2long(endIP);
    return start < end;
}

// Fungsi konversi IP ke long
function ip2long(ip) {
    const parts = ip.split('.');
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

// Fungsi untuk menampilkan form tambah
function showAddForm() {
    document.getElementById('add-form-container').style.display = 'block';
    document.getElementById('overlay').style.display = 'none'; // Sembunyikan overlay saat form ditampilkan
}

// Fungsi untuk menyembunyikan form tambah
function hideAddForm() {
    document.getElementById('add-form-container').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
}

// Fungsi untuk menampilkan form edit
function showEditForm() {
    document.getElementById('edit-form-container').style.display = 'block';
    document.getElementById('overlay').style.display = 'none'; // Sembunyikan overlay saat form ditampilkan
}

// Fungsi untuk menyembunyikan form edit
function hideEditForm() {
    document.getElementById('edit-form-container').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
}

// Fungsi untuk menampilkan modal delete
function showDeleteModal() {
    document.getElementById('delete-modal').style.display = 'flex';
    document.getElementById('overlay').style.display = 'none'; // Sembunyikan overlay saat modal ditampilkan
}

// Fungsi untuk menyembunyikan modal delete
function hideDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
}

// Fungsi untuk delete pool (akan diimplementasikan dengan AJAX)
function deletePool(id) {
    // Hapus konfirmasi tambahan, langsung hapus
    fetch('process_pool.php?action=delete&id=' + id, {
        method: 'GET'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                hideDeleteModal();
                refreshPools();
            } else {
                console.error('Error:', data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Fungsi untuk refresh data pool
function refreshPools() {
    fetch('process_pool.php?action=get_pools')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Refresh halaman untuk menampilkan data terbaru
                location.reload();
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Fungsi untuk delete paket (akan diimplementasikan dengan AJAX)
function deletePaket(id) {
    fetch('process_paket.php?action=delete&id=' + id, {
        method: 'GET'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                hideDeleteModal();
                refreshPakets();
            } else {
                console.error('Error:', data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Fungsi untuk refresh data paket
function refreshPakets() {
    fetch('process_paket.php?action=get_pakets')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Refresh halaman untuk menampilkan data terbaru
                location.reload();
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

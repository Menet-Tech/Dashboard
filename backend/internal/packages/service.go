package packages

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"sort"
	"strings"

	"menettech/dashboard/backend/internal/mikrotik"
)

var ErrPackageNotFound = errors.New("package not found")
var ErrPackageInUse = errors.New("package is still assigned to customers")

type Package struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	SpeedMbps     int    `json:"speed_mbps"`
	Price         int    `json:"price"`
	Description   string `json:"description"`
	CustomerCount int    `json:"customer_count"`
	IPPool        string `json:"ip_pool"`
	LocalAddress  string `json:"local_address"`
	IPPoolRange   string `json:"ip_pool_range,omitempty"` // used for creating new pool on the fly
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) List(ctx context.Context) ([]Package, error) {
	return s.Repository.List(ctx)
}

func (s Service) Create(ctx context.Context, pkg Package) (Package, error) {
	pkg.Name = strings.TrimSpace(pkg.Name)
	if pkg.Name == "" {
		return Package{}, errors.New("package name is required")
	}

	if pkg.SpeedMbps <= 0 {
		return Package{}, errors.New("package speed must be greater than 0")
	}

	if pkg.Price < 0 {
		return Package{}, errors.New("package price must not be negative")
	}

	// Derivation & Sync
	var err error
	pkg, err = s.syncPackageToMikrotik(ctx, pkg)
	if err != nil {
		return Package{}, fmt.Errorf("failed to sync package profile to MikroTik: %w", err)
	}

	return s.Repository.Create(ctx, pkg)
}

func (s Service) Update(ctx context.Context, id int64, pkg Package) (Package, error) {
	pkg.Name = strings.TrimSpace(pkg.Name)
	if pkg.Name == "" {
		return Package{}, errors.New("package name is required")
	}

	if pkg.SpeedMbps <= 0 {
		return Package{}, errors.New("package speed must be greater than 0")
	}

	if pkg.Price < 0 {
		return Package{}, errors.New("package price must not be negative")
	}

	// Retrieve original package name in case name changed, so we can clean up old profile
	var oldName string
	_ = s.Repository.DB.QueryRowContext(ctx, "SELECT nama FROM paket WHERE id = ?", id).Scan(&oldName)

	// Derivation & Sync
	var err error
	pkg, err = s.syncPackageToMikrotik(ctx, pkg)
	if err != nil {
		return Package{}, fmt.Errorf("failed to sync package profile to MikroTik: %w", err)
	}

	updated, err := s.Repository.Update(ctx, id, pkg)
	if err != nil {
		return Package{}, err
	}

	// Clean up old profile if name changed
	if oldName != "" && !strings.EqualFold(oldName, pkg.Name) {
		// 1. Query all customer secrets under this package
		type customerSecret struct {
			Username string
			Password string
			Status   string
		}
		var secrets []customerSecret
		rows, queryErr := s.Repository.DB.QueryContext(ctx, "SELECT user_pppoe, password_pppoe, status FROM pelanggan WHERE paket_id = ?", id)
		if queryErr == nil {
			for rows.Next() {
				var sec customerSecret
				if scanErr := rows.Scan(&sec.Username, &sec.Password, &sec.Status); scanErr == nil {
					sec.Username = strings.TrimSpace(sec.Username)
					if sec.Username != "" {
						secrets = append(secrets, sec)
					}
				}
			}
			rows.Close()
		}

		// 2. Fetch configured isolir and inactive profiles
		var isolirProfile string
		_ = s.Repository.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'mikrotik_isolir_profile'").Scan(&isolirProfile)
		isolirProfile = strings.TrimSpace(isolirProfile)
		if isolirProfile == "" {
			isolirProfile = "isolir"
		}

		var inactiveProfile string
		_ = s.Repository.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'mikrotik_inactive_profile'").Scan(&inactiveProfile)
		inactiveProfile = strings.TrimSpace(inactiveProfile)
		if inactiveProfile == "" {
			inactiveProfile = "nonaktif"
		}

		// 3. Connect to routers and update the secrets, then delete old profile
		routerSvc := mikrotik.NewRouterService(s.Repository.DB)
		if routers, err := routerSvc.ListActive(ctx); err == nil {
			for _, r := range routers {
				client := mikrotik.NewClient(r.Host, r.Username, r.Password)
				if err := client.Connect(ctx); err == nil {
					// Update secrets to use new profile name
					for _, sec := range secrets {
						profileName := pkg.Name
						switch sec.Status {
						case "limit":
							profileName = isolirProfile
						case "suspended", "inactive":
							profileName = inactiveProfile
						}
						_ = client.SyncCustomer(ctx, sec.Username, sec.Password, profileName, sec.Status)
					}

					// Delete old profile
					_ = client.DeletePPPProfile(ctx, oldName)
					client.Close()
				}
			}
		}
	}

	return updated, nil
}

func (s Service) Delete(ctx context.Context, id int64, deletePool bool) error {
	var name string
	var ipPool string
	_ = s.Repository.DB.QueryRowContext(ctx, "SELECT nama, COALESCE(ip_pool, '') FROM paket WHERE id = ?", id).Scan(&name, &ipPool)

	if err := s.Repository.Delete(ctx, id); err != nil {
		return err
	}

	// Clean up profile on MikroTik
	if name != "" {
		routerSvc := mikrotik.NewRouterService(s.Repository.DB)
		if routers, err := routerSvc.ListActive(ctx); err == nil {
			for _, r := range routers {
				client := mikrotik.NewClient(r.Host, r.Username, r.Password)
				if err := client.Connect(ctx); err == nil {
					_ = client.DeletePPPProfile(ctx, name)
					if deletePool && ipPool != "" {
						var poolInUse bool
						errUse := s.Repository.DB.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM paket WHERE ip_pool = ?)", ipPool).Scan(&poolInUse)
						if errUse == nil && !poolInUse {
							_ = client.DeleteIPPool(ctx, ipPool)
						} else {
							slog.Info("reconcile: skip deleting IP Pool because it is still used by other packages", "ip_pool", ipPool)
						}
					}
					client.Close()
				}
			}
		}
	}

	return nil
}

func (s Service) syncPackageToMikrotik(ctx context.Context, pkg Package) (Package, error) {
	pkg.IPPool = strings.TrimSpace(pkg.IPPool)
	pkg.IPPoolRange = strings.TrimSpace(pkg.IPPoolRange)

	if pkg.IPPool == "" {
		return pkg, nil // No IP pool configured, skip sync
	}

	if val := ctx.Value("skip_mikrotik_sync"); val != nil && val.(bool) == true {
		return pkg, nil // Skip any MikroTik manipulation entirely
	}

	if pkg.IPPoolRange != "" {
		pkg.LocalAddress = deriveLocalAddress(pkg.IPPoolRange)
	}

	routerSvc := mikrotik.NewRouterService(s.Repository.DB)
	routers, err := routerSvc.ListActive(ctx)
	if err != nil {
		return pkg, err
	}
	if len(routers) == 0 {
		return pkg, nil // No active routers, skip sync
	}

	// Sort routers so that main router is first
	sort.Slice(routers, func(i, j int) bool {
		return routers[i].Role == "main" && routers[j].Role != "main"
	})

	// 1. If range is provided, create/update pool and calculate local address
	if pkg.IPPoolRange != "" {
		for _, r := range routers {
			client := mikrotik.NewClient(r.Host, r.Username, r.Password)
			if err := client.Connect(ctx); err != nil {
				return pkg, fmt.Errorf("connect to router %s: %w", r.Name, err)
			}
			err = client.AddIPPool(ctx, pkg.IPPool, pkg.IPPoolRange)
			client.Close()
			if err != nil {
				return pkg, fmt.Errorf("create pool on router %s: %w", r.Name, err)
			}
		}
	} else {
		// 2. Resolve local address from existing pool range on active routers
		resolvedRange := ""
		for _, r := range routers {
			client := mikrotik.NewClient(r.Host, r.Username, r.Password)
			if err := client.Connect(ctx); err == nil {
				pools, err := client.ListIPPools(ctx)
				client.Close()
				if err == nil {
					for _, p := range pools {
						if strings.EqualFold(p.Name, pkg.IPPool) {
							resolvedRange = p.Ranges
							break
						}
					}
				}
			}
			if resolvedRange != "" {
				break
			}
		}
		if resolvedRange == "" {
			return pkg, fmt.Errorf("ip pool %q not found on active routers", pkg.IPPool)
		}
		pkg.LocalAddress = deriveLocalAddress(resolvedRange)
	}

	// 3. Sync PPP Profile across all active routers
	rateLimit := fmt.Sprintf("%dM/%dM", pkg.SpeedMbps, pkg.SpeedMbps)
	for _, r := range routers {
		client := mikrotik.NewClient(r.Host, r.Username, r.Password)
		if err := client.Connect(ctx); err != nil {
			return pkg, fmt.Errorf("connect to router %s: %w", r.Name, err)
		}

		// Resolve the exact pool name case-sensitively from the router's pools
		actualPoolName := pkg.IPPool
		if pools, err := client.ListIPPools(ctx); err == nil {
			for _, p := range pools {
				if strings.EqualFold(p.Name, pkg.IPPool) {
					actualPoolName = p.Name
					break
				}
			}
		}

		err = client.SyncPPPProfile(ctx, pkg.Name, pkg.LocalAddress, actualPoolName, rateLimit)
		client.Close()
		if err != nil {
			return pkg, fmt.Errorf("sync ppp profile on router %s: %w", r.Name, err)
		}
	}

	return pkg, nil
}

func deriveLocalAddress(poolRange string) string {
	parts := strings.FieldsFunc(poolRange, func(r rune) bool {
		return r == '-' || r == ',' || r == ' '
	})
	if len(parts) == 0 {
		return ""
	}
	ipStr := strings.TrimSpace(parts[0])
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return ""
	}
	ipv4 := ip.To4()
	if ipv4 == nil {
		return ""
	}
	ipv4[3] = 254
	return ipv4.String()
}

func (r Repository) List(ctx context.Context) ([]Package, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT p.id, p.nama, p.kecepatan_mbps, p.harga, COALESCE(p.deskripsi, ''), 
		       COALESCE(p.ip_pool, ''), COALESCE(p.local_address, ''), COUNT(c.id)
		FROM paket p
		LEFT JOIN pelanggan c ON c.paket_id = p.id
		GROUP BY p.id, p.nama, p.kecepatan_mbps, p.harga, p.deskripsi, p.ip_pool, p.local_address
		ORDER BY p.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list packages: %w", err)
	}
	defer rows.Close()

	items := []Package{}
	for rows.Next() {
		var item Package
		if err := rows.Scan(&item.ID, &item.Name, &item.SpeedMbps, &item.Price, &item.Description, &item.IPPool, &item.LocalAddress, &item.CustomerCount); err != nil {
			return nil, fmt.Errorf("scan package: %w", err)
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) Create(ctx context.Context, pkg Package) (Package, error) {
	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO paket (nama, kecepatan_mbps, harga, deskripsi, ip_pool, local_address, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, pkg.Name, pkg.SpeedMbps, pkg.Price, strings.TrimSpace(pkg.Description), pkg.IPPool, pkg.LocalAddress)
	if err != nil {
		return Package{}, fmt.Errorf("create package: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Package{}, fmt.Errorf("get package id: %w", err)
	}

	pkg.ID = id
	return pkg, nil
}

func (r Repository) Update(ctx context.Context, id int64, pkg Package) (Package, error) {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE paket
		SET nama = ?, kecepatan_mbps = ?, harga = ?, deskripsi = ?, ip_pool = ?, local_address = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, pkg.Name, pkg.SpeedMbps, pkg.Price, strings.TrimSpace(pkg.Description), pkg.IPPool, pkg.LocalAddress, id)
	if err != nil {
		return Package{}, fmt.Errorf("update package: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return Package{}, fmt.Errorf("package update rows affected: %w", err)
	}

	if affected == 0 {
		return Package{}, ErrPackageNotFound
	}

	pkg.ID = id
	return pkg, nil
}

func (r Repository) Delete(ctx context.Context, id int64) error {
	var customerCount int
	if err := r.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM pelanggan WHERE paket_id = ?`, id).Scan(&customerCount); err != nil {
		return fmt.Errorf("count package customers: %w", err)
	}

	if customerCount > 0 {
		return ErrPackageInUse
	}

	result, err := r.DB.ExecContext(ctx, `DELETE FROM paket WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete package: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("package delete rows affected: %w", err)
	}

	if affected == 0 {
		return ErrPackageNotFound
	}

	return nil
}

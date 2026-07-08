package mikrotik

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
)

type SyncResult struct {
	PoolsSynced    int      `json:"pools_synced"`
	ProfilesSynced int      `json:"profiles_synced"`
	SecretsSynced  int      `json:"secrets_synced"`
	Errors         []string `json:"errors,omitempty"`
}

// SyncMainToSlaves synchronizes IP Pools, PPP Profiles, and PPP Secrets from the active main router to all active slave routers.
func (s *RouterService) SyncMainToSlaves(ctx context.Context) (*SyncResult, error) {
	// 1. Get all active routers
	routers, err := s.ListActive(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list active routers: %w", err)
	}

	var mainRouter *Router
	var slaveRouters []Router

	for i := range routers {
		switch routers[i].Role {
		case "main":
			mainRouter = &routers[i]
		case "slave":
			slaveRouters = append(slaveRouters, routers[i])
		}
	}

	if mainRouter == nil {
		return nil, fmt.Errorf("no active main (utama) MikroTik router found")
	}
	if len(slaveRouters) == 0 {
		return nil, fmt.Errorf("no active slave (second) MikroTik routers found")
	}

	// 2. Connect to main router and fetch data
	mainClient := NewClient(mainRouter.Host, mainRouter.Username, mainRouter.Password)
	if err := mainClient.Connect(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to main router %s (%s): %w", mainRouter.Name, mainRouter.Host, err)
	}
	defer mainClient.Close()

	// Reconcile profiles to the main router from database first
	if err := s.ReconcileProfiles(ctx, mainClient); err != nil {
		slog.Error("sync: failed to reconcile profiles on main router", "router", mainRouter.Name, "error", err)
	}

	pools, err := mainClient.ListIPPools(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list ip pools from main router: %w", err)
	}

	profiles, err := mainClient.ListProfiles(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list profiles from main router: %w", err)
	}

	secrets, err := mainClient.ListSecrets(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list secrets from main router: %w", err)
	}

	result := &SyncResult{}

	// 3. Sync to each slave router
	for _, slave := range slaveRouters {
		err := func() error {
			slaveClient := NewClient(slave.Host, slave.Username, slave.Password)
			if err := slaveClient.Connect(ctx); err != nil {
				return fmt.Errorf("failed to connect to slave %s (%s): %w", slave.Name, slave.Host, err)
			}
			defer slaveClient.Close()

			// Sync IP Pools
			for _, pool := range pools {
				if err := slaveClient.AddIPPool(ctx, pool.Name, pool.Ranges); err != nil {
					return fmt.Errorf("failed to sync ip pool %q: %w", pool.Name, err)
				}
				result.PoolsSynced++
			}

			// Sync PPP Profiles
			for _, profile := range profiles {
				// We don't sync built-in profiles like "default" and "default-encryption" to avoid conflicts or read-only/missing pool errors.
				if profile.Name == "default" || profile.Name == "default-encryption" {
					continue
				}
				if err := slaveClient.SyncPPPProfile(ctx, profile.Name, profile.LocalAddress, profile.RemoteAddress, profile.RateLimit); err != nil {
					return fmt.Errorf("failed to sync ppp profile %q: %w", profile.Name, err)
				}
				result.ProfilesSynced++
			}

			// Sync PPP Secrets
			for _, secret := range secrets {
				status := "active"
				if secret.Disabled {
					status = "inactive"
				}
				if err := slaveClient.SyncCustomer(ctx, secret.Name, secret.Password, secret.Profile, status); err != nil {
					return fmt.Errorf("failed to sync ppp secret %q: %w", secret.Name, err)
				}
				result.SecretsSynced++
			}

			// Disable PPPoE interface on slave router to avoid collision with main
			if slave.Role == "slave" && slave.SlavePort != "" {
				slog.Info("sync: disabling backup port on slave router", "router", slave.Name, "port", slave.SlavePort)
				if err := slaveClient.SetInterfaceDisabled(ctx, slave.SlavePort, true); err != nil {
					slog.Error("sync: failed to disable backup port on slave router", "router", slave.Name, "port", slave.SlavePort, "error", err)
				}
			}

			return nil
		}()

		if err != nil {
			result.Errors = append(result.Errors, err.Error())
		}
	}

	if len(result.Errors) > 0 {
		return result, fmt.Errorf("synchronization completed with errors: %s", strings.Join(result.Errors, "; "))
	}

	return result, nil
}

// ReconcileProfiles ensures that all PPP profiles defined in the database packages exist on the given router client.
func (s *RouterService) ReconcileProfiles(ctx context.Context, client *Client) error {
	rows, err := s.DB.QueryContext(ctx, "SELECT nama, kecepatan_mbps, COALESCE(ip_pool, ''), COALESCE(local_address, '') FROM paket")
	if err != nil {
		return fmt.Errorf("failed to query packages: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var name, ipPool, localAddress string
		var speedMbps int
		if err := rows.Scan(&name, &speedMbps, &ipPool, &localAddress); err != nil {
			return fmt.Errorf("scan package: %w", err)
		}

		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}

		rateLimit := fmt.Sprintf("%dM/%dM", speedMbps, speedMbps)
		// Resolve the exact pool name case-sensitively from the router's pools if configured
		actualPoolName := ipPool
		if ipPool != "" {
			if pools, err := client.ListIPPools(ctx); err == nil {
				for _, p := range pools {
					if strings.EqualFold(p.Name, ipPool) {
						actualPoolName = p.Name
						break
					}
				}
			}
		}

		if err := client.SyncPPPProfile(ctx, name, localAddress, actualPoolName, rateLimit); err != nil {
			slog.Error("reconcile profiles: failed to sync profile", "profile", name, "error", err)
		}
	}
	return nil
}

// ReconcileSecrets reconciles customer PPPoE secrets between the local database and a specific router.
func (s *RouterService) ReconcileSecrets(ctx context.Context, r Router) error {
	// 1. Connect to the router
	client := NewClient(r.Host, r.Username, r.Password)
	if err := client.Connect(ctx); err != nil {
		return fmt.Errorf("failed to connect to router %s (%s): %w", r.Name, r.Host, err)
	}
	defer client.Close()

	// Reconcile profiles first
	if err := s.ReconcileProfiles(ctx, client); err != nil {
		slog.Error("reconcile: failed to reconcile profiles", "router", r.Name, "error", err)
	}

	// 2. Fetch the isolir and inactive profiles from the pengaturan table
	var isolirProfile string
	_ = s.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = ?", "mikrotik_isolir_profile").Scan(&isolirProfile)
	isolirProfile = strings.TrimSpace(isolirProfile)
	if isolirProfile == "" {
		isolirProfile = "isolir"
	}

	var inactiveProfile string
	_ = s.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = ?", "mikrotik_inactive_profile").Scan(&inactiveProfile)
	inactiveProfile = strings.TrimSpace(inactiveProfile)
	if inactiveProfile == "" {
		inactiveProfile = "nonaktif"
	}

	// 3. Fetch all active/inactive customers with PPPoE configured from the database
	type dbSecret struct {
		Username string
		Password string
		Status   string
		Profile  string
	}
	rows, err := s.DB.QueryContext(ctx, `
		SELECT c.user_pppoe, c.password_pppoe, c.status, p.nama
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		WHERE c.user_pppoe IS NOT NULL AND c.user_pppoe != ''
	`)
	if err != nil {
		return fmt.Errorf("failed to query pelanggan from database: %w", err)
	}
	defer rows.Close()

	var dbSecrets []dbSecret
	for rows.Next() {
		var ds dbSecret
		if err := rows.Scan(&ds.Username, &ds.Password, &ds.Status, &ds.Profile); err != nil {
			return fmt.Errorf("scan db secret: %w", err)
		}
		ds.Username = strings.TrimSpace(ds.Username)
		if ds.Username != "" {
			dbSecrets = append(dbSecrets, ds)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows error: %w", err)
	}

	// 4. Fetch all secrets currently on the MikroTik router
	routerSecrets, err := client.ListSecrets(ctx)
	if err != nil {
		return fmt.Errorf("failed to list secrets from router: %w", err)
	}

	// 5. Map router secrets by username (lowercased)
	routerSecretsMap := make(map[string]PPPoESecret)
	for _, sec := range routerSecrets {
		routerSecretsMap[strings.ToLower(sec.Name)] = sec
	}

	// 6. Reconcile database secrets to the router
	for _, dbSec := range dbSecrets {
		usernameLower := strings.ToLower(dbSec.Username)

		// Determine target profile and disabled state
		var targetProfile string
		var disabled bool
		switch dbSec.Status {
		case "active":
			targetProfile = dbSec.Profile
			if targetProfile == "" {
				targetProfile = "default"
			}
			disabled = false
		case "limit":
			targetProfile = isolirProfile
			disabled = false
		case "suspended":
			targetProfile = inactiveProfile
			disabled = false
		case "inactive":
			targetProfile = inactiveProfile
			disabled = true
		default:
			targetProfile = dbSec.Profile
			if targetProfile == "" {
				targetProfile = "default"
			}
			disabled = false
		}

		rSec, exists := routerSecretsMap[usernameLower]
		if exists {
			// Secret exists on router, check if we need to update it
			if rSec.Password != dbSec.Password || rSec.Profile != targetProfile || rSec.Disabled != disabled {
				// Out of sync! Update it
				if err := client.SyncCustomer(ctx, dbSec.Username, dbSec.Password, dbSec.Profile, dbSec.Status); err != nil {
					slog.Error("reconcile: failed to update customer secret", "router", r.Name, "username", dbSec.Username, "error", err)
				}
			}
			// Delete from map to mark as processed
			delete(routerSecretsMap, usernameLower)
		} else {
			// Secret does not exist on router, add it
			if err := client.SyncCustomer(ctx, dbSec.Username, dbSec.Password, dbSec.Profile, dbSec.Status); err != nil {
				slog.Error("reconcile: failed to add customer secret", "router", r.Name, "username", dbSec.Username, "error", err)
			}
		}
	}

	// 7. Remove remaining secrets on the router that are not in the database
	for _, rSec := range routerSecretsMap {
		if rSec.Name != "" {
			if err := client.DeleteSecret(ctx, rSec.Name); err != nil {
				slog.Error("reconcile: failed to delete customer secret", "router", r.Name, "username", rSec.Name, "error", err)
			}
		}
	}

	return nil
}


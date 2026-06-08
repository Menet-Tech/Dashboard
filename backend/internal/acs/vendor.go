package acs

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// Vendor represents ONT vendor configuration retrieved from database.
type Vendor struct {
	ID                   int64    `json:"id"`
	Name                 string   `json:"name"`
	ManufacturerPatterns []string `json:"manufacturer_patterns"`
	ProductPatterns      []string `json:"product_patterns"`
	ParameterPrefix      string   `json:"parameter_prefix"`
	ServiceListPath      string   `json:"service_list_path"`
	LanBindingPath       string   `json:"lan_binding_path"`
	VlanIDPath           string   `json:"vlan_id_path"`
	HTTPWanEnablePath    string   `json:"http_wan_enable_path"`
	FirewallLevelPath    string   `json:"firewall_level_path"`
	Priority             int      `json:"priority"`
	Enabled              int      `json:"enabled"`
	Description          string   `json:"description"`
}

// WiFiSecurityConfig represents SSID password configuration path.
type WiFiSecurityConfig struct {
	ID                int64    `json:"id"`
	ProductClass      string   `json:"product_class"`
	SecurityTypes     []string `json:"security_types"`
	PasswordParamPath string   `json:"password_param_path"`
}

// GetVendors retrieves all enabled vendors from database.
func GetVendors(ctx context.Context, db *sql.DB) ([]Vendor, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, name, manufacturer_patterns, product_patterns, parameter_prefix, 
		       service_list_path, lan_binding_path, vlan_id_path, http_wan_enable_path, 
		       firewall_level_path, priority, enabled, COALESCE(description, '')
		FROM vendors 
		WHERE enabled = 1 
		ORDER BY priority DESC, name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("query vendors: %w", err)
	}
	defer rows.Close()

	var list []Vendor
	for rows.Next() {
		var v Vendor
		var mfrRaw, prodRaw string
		if err := rows.Scan(
			&v.ID, &v.Name, &mfrRaw, &prodRaw, &v.ParameterPrefix,
			&v.ServiceListPath, &v.LanBindingPath, &v.VlanIDPath, &v.HTTPWanEnablePath,
			&v.FirewallLevelPath, &v.Priority, &v.Enabled, &v.Description,
		); err != nil {
			return nil, fmt.Errorf("scan vendor: %w", err)
		}

		_ = json.Unmarshal([]byte(mfrRaw), &v.ManufacturerPatterns)
		_ = json.Unmarshal([]byte(prodRaw), &v.ProductPatterns)
		list = append(list, v)
	}

	return list, nil
}

// GetWiFiSecurityConfig finds SSID configuration by Product Class.
func GetWiFiSecurityConfig(ctx context.Context, db *sql.DB, productClass string) (*WiFiSecurityConfig, error) {
	if productClass == "" {
		return nil, nil
	}

	rows, err := db.QueryContext(ctx, `
		SELECT id, product_class, security_types, password_param_path
		FROM wifi_security_config
	`)
	if err != nil {
		return nil, fmt.Errorf("query wifi security config: %w", err)
	}
	defer rows.Close()

	pcLower := strings.ToLower(productClass)
	for rows.Next() {
		var w WiFiSecurityConfig
		var typesRaw string
		if err := rows.Scan(&w.ID, &w.ProductClass, &typesRaw, &w.PasswordParamPath); err != nil {
			return nil, fmt.Errorf("scan wifi config: %w", err)
		}

		w.SecurityTypes = strings.Split(typesRaw, ",")
		for i, val := range w.SecurityTypes {
			w.SecurityTypes[i] = strings.TrimSpace(val)
		}

		// Check if product class is inside comma-separated list
		classes := strings.Split(w.ProductClass, ",")
		for _, c := range classes {
			if strings.TrimSpace(strings.ToLower(c)) == pcLower {
				return &w, nil
			}
		}
	}

	return nil, nil
}

// DetectVendor detects vendor based on manufacturer, product class, and actual device data.
func DetectVendor(ctx context.Context, db *sql.DB, manufacturer, productClass string, deviceData map[string]any) (*Vendor, error) {
	vendors, err := GetVendors(ctx, db)
	if err != nil {
		return nil, err
	}

	mfrLower := strings.ToLower(manufacturer)
	prodLower := strings.ToLower(productClass)

	var matches []Vendor
	for _, v := range vendors {
		mfrMatch := false
		for _, pat := range v.ManufacturerPatterns {
			if strings.Contains(mfrLower, strings.ToLower(pat)) {
				mfrMatch = true
				break
			}
		}

		if mfrMatch {
			if len(v.ProductPatterns) > 0 {
				prodMatch := false
				for _, pat := range v.ProductPatterns {
					if strings.Contains(prodLower, strings.ToLower(pat)) {
						prodMatch = true
						break
					}
				}
				if prodMatch {
					matches = append(matches, v)
				}
			} else {
				matches = append(matches, v)
			}
		}
	}

	if len(matches) > 1 && deviceData != nil {
		for _, v := range matches {
			if v.ParameterPrefix != "" && HasVendorPrefix(deviceData, v.ParameterPrefix) {
				return &v, nil
			}
		}
	}

	if len(matches) > 0 {
		return &matches[0], nil
	}

	// Fallback to product class patterns
	for _, v := range vendors {
		for _, pat := range v.ProductPatterns {
			if strings.Contains(prodLower, strings.ToLower(pat)) {
				return &v, nil
			}
		}
	}

	return nil, nil
}

// HasVendorPrefix checks if deviceData contains the vendor's parameter prefix keys recursively.
func HasVendorPrefix(deviceData map[string]any, prefix string) bool {
	if len(deviceData) == 0 || prefix == "" {
		return false
	}

	// Direct check in map
	if _, ok := deviceData[prefix]; ok {
		return true
	}

	// Check recursively in map keys
	for k, v := range deviceData {
		if strings.HasSuffix(k, prefix) || strings.Contains(k, "."+prefix) {
			return true
		}
		if childMap, ok := v.(map[string]any); ok {
			if HasVendorPrefix(childMap, prefix) {
				return true
			}
		}
	}

	return false
}

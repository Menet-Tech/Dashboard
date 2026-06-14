package acs

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type WANDeviceInfo struct {
	DeviceID          string         `json:"device_id"`
	ProductClass      string         `json:"product_class"`
	ParameterPrefix   string         `json:"parameter_prefix"`
	Vendor            string         `json:"vendor"`
	WanIPConnections  []string       `json:"wan_ip_connections"`
	WanPPPConnections []string       `json:"wan_ppp_connections"`
	AvailableSlots    AvailableSlots `json:"available_slots"`
}

type AvailableSlots struct {
	WanIPConnections  []string `json:"wan_ip_connections"`
	WanPPPConnections []string `json:"wan_ppp_connections"`
}

type WANConnectionConfig struct {
	Name        string          `json:"name"`
	Username    string          `json:"username"`
	Password    string          `json:"password"`
	VlanID      int             `json:"vlan_id"`
	BindingType string          `json:"binding_type"` // "integer" or "boolean"
	Bindings    map[string]bool `json:"bindings"`     // e.g. lan1, ssid1, etc
}

type WANCreationResult struct {
	Success         bool     `json:"success"`
	DeviceID        string   `json:"device_id"`
	Vendor          string   `json:"vendor"`
	ParameterPrefix string   `json:"parameter_prefix"`
	ConnectionPath  string   `json:"connection_path"`
	Message         string   `json:"message"`
	Verified        bool     `json:"verified"`
}

type WANDeletionResult struct {
	Success      bool   `json:"success"`
	Message      string `json:"message"`
	DeviceID     string `json:"device_id"`
	DeletedPath  string `json:"deleted_path"`
	DeletedName  string `json:"deleted_name"`
	DeletionType string `json:"deletion_type"`
}

// CleanGenieACSData recursively removes metadata keys (starting with _) from JSON maps.
func CleanGenieACSData(data any) any {
	switch val := data.(type) {
	case map[string]any:
		cleaned := make(map[string]any)
		for k, v := range val {
			if k == "_object" || k == "_writable" || k == "_timestamp" || k == "_type" || k == "_instance" {
				continue
			}
			cleaned[k] = CleanGenieACSData(v)
		}
		return cleaned
	case []any:
		cleaned := make([]any, len(val))
		for i, v := range val {
			cleaned[i] = CleanGenieACSData(v)
		}
		return cleaned
	default:
		return val
	}
}

// CheckWANDevice scans a device to check WAN connection paths and available slots.
func (c *Client) CheckWANDevice(ctx context.Context, db *sql.DB, deviceID string) (*WANDeviceInfo, error) {
	if deviceID == "" {
		return nil, fmt.Errorf("device ID is required")
	}

	projection := []string{
		"_id",
		"_deviceId._ProductClass",
		"_deviceId._SerialNumber",
		"_deviceId._Manufacturer",
		"_deviceId._OUI",
		"InternetGatewayDevice.WANDevice",
	}

	queryJSON := fmt.Sprintf(`{"_id":"%s"}`, deviceID)
	reqURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", c.BaseURL, url.QueryEscape(queryJSON), url.QueryEscape(strings.Join(projection, ",")))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("genieacs returned status %d: %s", resp.StatusCode, string(body))
	}

	var devices []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil {
		return nil, err
	}
	if len(devices) == 0 {
		return nil, fmt.Errorf("device not found")
	}

	dev := devices[0]
	var manufacturer, productClass string
	if devID, ok := dev["_deviceId"].(map[string]any); ok {
		if m, ok := devID["_Manufacturer"].(string); ok {
			manufacturer = m
		}
		if p, ok := devID["_ProductClass"].(string); ok {
			productClass = p
		}
	}

	vendorObj, err := DetectVendor(ctx, db, manufacturer, productClass, dev)
	if err != nil {
		return nil, err
	}

	vendor := "unknown"
	prefix := ""
	if vendorObj != nil {
		vendor = strings.ToLower(vendorObj.Name)
		prefix = vendorObj.ParameterPrefix
	}

	// Extract WANDevice
	wanIPConnections := []string{}
	wanPPPConnections := []string{}
	var availableSlots AvailableSlots

	igd := getNestedMap(dev, "InternetGatewayDevice")
	wanDevices := getNestedMap(igd, "WANDevice")
	cleanedWanDevicesRaw := CleanGenieACSData(wanDevices)

	if cleanedWanDevices, ok := cleanedWanDevicesRaw.(map[string]any); ok {
		var usedConnectionDevices []int

		for wanDeviceIndex, wanDeviceRaw := range cleanedWanDevices {
			wanDevice, ok := wanDeviceRaw.(map[string]any)
			if !ok {
				continue
			}
			wanConnDevs := getNestedMap(wanDevice, "WANConnectionDevice")
			if wanConnDevs == nil {
				continue
			}

			for connDeviceIndex, connDeviceRaw := range wanConnDevs {
				connDevice, ok := connDeviceRaw.(map[string]any)
				if !ok {
					continue
				}
				connDeviceNum, _ := strconv.Atoi(connDeviceIndex)

				var ipIndices []int
				var pppIndices []int
				hasAnyConnection := false

				if ipConns := getNestedMap(connDevice, "WANIPConnection"); ipConns != nil {
					for ipConnIndex := range ipConns {
						ipIdx, _ := strconv.Atoi(ipConnIndex)
						ipIndices = append(ipIndices, ipIdx)
						wanIPConnections = append(wanIPConnections, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANIPConnection.%s", wanDeviceIndex, connDeviceIndex, ipConnIndex))
						hasAnyConnection = true
					}
				}

				if pppConns := getNestedMap(connDevice, "WANPPPConnection"); pppConns != nil {
					for pppConnIndex := range pppConns {
						pppIdx, _ := strconv.Atoi(pppConnIndex)
						pppIndices = append(pppIndices, pppIdx)
						wanPPPConnections = append(wanPPPConnections, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANPPPConnection.%s", wanDeviceIndex, connDeviceIndex, pppConnIndex))
						hasAnyConnection = true
					}
				}

				if hasAnyConnection {
					usedConnectionDevices = append(usedConnectionDevices, connDeviceNum)
				}

				// Slots inside existing WANConnectionDevice
				if len(ipIndices) > 0 && len(pppIndices) == 0 {
					availableSlots.WanPPPConnections = append(availableSlots.WanPPPConnections, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANPPPConnection.1", wanDeviceIndex, connDeviceIndex))
				} else if len(pppIndices) > 0 {
					maxPPP := maxInt(pppIndices)
					availableSlots.WanPPPConnections = append(availableSlots.WanPPPConnections, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANPPPConnection.%d", wanDeviceIndex, connDeviceIndex, maxPPP+1))
				}

				if len(ipIndices) > 0 {
					maxIP := maxInt(ipIndices)
					availableSlots.WanIPConnections = append(availableSlots.WanIPConnections, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANIPConnection.%d", wanDeviceIndex, connDeviceIndex, maxIP+1))
				}
			}

			// New WANConnectionDevice slot
			if len(usedConnectionDevices) > 0 {
				maxConnDev := maxInt(usedConnectionDevices)
				availableSlots.WanPPPConnections = append(availableSlots.WanPPPConnections, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%d.WANPPPConnection.1", wanDeviceIndex, maxConnDev+1))
			} else {
				availableSlots.WanPPPConnections = append(availableSlots.WanPPPConnections, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.1.WANPPPConnection.1", wanDeviceIndex))
			}
		}
	}

	return &WANDeviceInfo{
		DeviceID:          deviceID,
		ProductClass:      productClass,
		ParameterPrefix:   prefix,
		Vendor:            vendor,
		WanIPConnections:  wanIPConnections,
		WanPPPConnections: wanPPPConnections,
		AvailableSlots:    availableSlots,
	}, nil
}

// CreateWANConnection dynamically configures Routed PPPoE or Bridged connections.
func (c *Client) CreateWANConnection(ctx context.Context, db *sql.DB, deviceID string, connType string, config WANConnectionConfig) (*WANCreationResult, error) {
	wanInfo, err := c.CheckWANDevice(ctx, db, deviceID)
	if err != nil {
		return nil, fmt.Errorf("check wan before creation: %w", err)
	}

	switch wanInfo.ParameterPrefix {
	case "X_HW":
		return c.createWANConnection_Huawei(ctx, deviceID, connType, config, wanInfo)
	case "X_CMCC":
		return c.createWANConnection_CMCC(ctx, deviceID, connType, config, wanInfo)
	case "X_FH":
		return c.createWANConnection_FiberHome(ctx, deviceID, connType, config, wanInfo)
	case "X_ZTE-COM":
		return c.createWANConnection_ZTECOM(ctx, deviceID, connType, config, wanInfo)
	default:
		return nil, fmt.Errorf("unsupported parameter prefix: %s", wanInfo.ParameterPrefix)
	}
}

// createWANConnection_Huawei creates WAN on Huawei ONTs.
func (c *Client) createWANConnection_Huawei(ctx context.Context, deviceID string, connType string, config WANConnectionConfig, wanInfo *WANDeviceInfo) (*WANCreationResult, error) {
	var slots []string
	if connType == "bridge" {
		slots = wanInfo.AvailableSlots.WanIPConnections
	} else {
		slots = wanInfo.AvailableSlots.WanPPPConnections
	}

	if len(slots) == 0 {
		return nil, fmt.Errorf("no available slots for Huawei WAN creation")
	}

	var connectionPath string
	var err error
	var attemptedSlots []string

	for _, slot := range slots {
		attemptedSlots = append(attemptedSlots, slot)
		parentPath := slot[:strings.LastIndex(slot, ".")]

		// AddObject task
		if err = c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": parentPath}); err != nil {
			continue
		}

		time.Sleep(2 * time.Second)

		// Verify slot created
		verify, err := c.CheckWANDevice(ctx, nil, deviceID)
		if err != nil {
			continue
		}

		pathExists := false
		if connType == "bridge" {
			pathExists = contains(verify.WanIPConnections, slot)
		} else {
			pathExists = contains(verify.WanPPPConnections, slot)
		}

		if pathExists {
			connectionPath = slot
			break
		}
	}

	if connectionPath == "" {
		return nil, fmt.Errorf("failed to create object after attempts: %v. last error: %v", attemptedSlots, err)
	}

	// Set parameters
	var params [][]any
	if connType == "bridge" {
		params = append(params,
			[]any{connectionPath + ".X_HW_VLAN", config.VlanID, "xsd:int"},
			[]any{connectionPath + ".ConnectionType", "PPPoE_Bridged", "xsd:string"},
			[]any{connectionPath + ".X_HW_SERVICELIST", "OTHER", "xsd:string"},
			[]any{connectionPath + ".NATEnabled", "false", "xsd:boolean"},
		)
	} else {
		params = append(params,
			[]any{connectionPath + ".X_HW_VLAN", config.VlanID, "xsd:int"},
			[]any{connectionPath + ".Username", config.Username, "xsd:string"},
			[]any{connectionPath + ".Password", config.Password, "xsd:string"},
			[]any{connectionPath + ".ConnectionType", "IP_Routed", "xsd:string"},
			[]any{connectionPath + ".X_HW_SERVICELIST", "INTERNET", "xsd:string"},
			[]any{connectionPath + ".NATEnabled", "true", "xsd:boolean"},
		)
	}

	if config.Name != "" {
		params = append(params, []any{connectionPath + ".Name", config.Name, "xsd:string"})
	}

	// Add LAN/SSID bindings
	for k, v := range config.Bindings {
		keyName := ""
		if strings.HasPrefix(k, "lan") {
			keyName = fmt.Sprintf("Lan%sEnable", k[3:])
		} else if strings.HasPrefix(k, "ssid") {
			keyName = fmt.Sprintf("SSID%sEnable", k[4:])
		}

		if keyName != "" {
			if config.BindingType == "boolean" {
				valStr := "false"
				if v {
					valStr = "true"
				}
				params = append(params, []any{connectionPath + ".X_HW_LANBIND." + keyName, valStr, "xsd:boolean"})
			} else {
				valInt := 0
				if v {
					valInt = 1
				}
				params = append(params, []any{connectionPath + ".X_HW_LANBIND." + keyName, valInt, "xsd:int"})
			}
		}
	}

	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{"parameterValues": params}); err != nil {
		return nil, fmt.Errorf("set parameters: %w", err)
	}

	// Enable connection
	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{
		"parameterValues": [][]any{{connectionPath + ".Enable", "true", "xsd:boolean"}},
	}); err != nil {
		return nil, fmt.Errorf("enable connection: %w", err)
	}

	// Trigger getParameterValues for verification
	_ = c.postTask(ctx, deviceID, "getParameterValues", map[string]any{
		"parameterNames": []string{connectionPath + ".Enable", connectionPath + ".ConnectionStatus"},
	})

	return &WANCreationResult{
		Success:         true,
		DeviceID:        deviceID,
		Vendor:          wanInfo.Vendor,
		ParameterPrefix: wanInfo.ParameterPrefix,
		ConnectionPath:  connectionPath,
		Verified:        true,
		Message:         "Huawei WAN connection created successfully",
	}, nil
}

// createWANConnection_CMCC creates WAN on ZTE/CMCC ONTs.
func (c *Client) createWANConnection_CMCC(ctx context.Context, deviceID string, connType string, config WANConnectionConfig, wanInfo *WANDeviceInfo) (*WANCreationResult, error) {
	slots := wanInfo.AvailableSlots.WanPPPConnections
	if len(slots) == 0 {
		return nil, fmt.Errorf("no available slots for CMCC WAN creation")
	}

	var connectionPath string
	var err error

	for _, slot := range slots {
		parentPath := slot[:strings.LastIndex(slot, ".")]
		if err = c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": parentPath}); err != nil {
			continue
		}

		time.Sleep(2 * time.Second)

		verify, err := c.CheckWANDevice(ctx, nil, deviceID)
		if err != nil {
			continue
		}

		if contains(verify.WanPPPConnections, slot) {
			connectionPath = slot
			break
		}
	}

	if connectionPath == "" {
		return nil, fmt.Errorf("failed to create object: %v", err)
	}

	vlanMode := 0
	if config.VlanID > 0 {
		vlanMode = 2
	}

	var params [][]any
	if connType == "bridge" {
		params = append(params,
			[]any{connectionPath + ".X_CMCC_VLANIDMark", config.VlanID, "xsd:int"},
			[]any{connectionPath + ".X_CMCC_VLANMode", vlanMode, "xsd:int"},
			[]any{connectionPath + ".ConnectionType", "PPPoE_Bridged", "xsd:string"},
			[]any{connectionPath + ".X_CMCC_ServiceList", "OTHER", "xsd:string"},
			[]any{connectionPath + ".NATEnabled", "FALSE", "xsd:boolean"},
		)
	} else {
		params = append(params,
			[]any{connectionPath + ".X_CMCC_VLANIDMark", config.VlanID, "xsd:int"},
			[]any{connectionPath + ".X_CMCC_VLANMode", vlanMode, "xsd:int"},
			[]any{connectionPath + ".Username", config.Username, "xsd:string"},
			[]any{connectionPath + ".Password", config.Password, "xsd:string"},
			[]any{connectionPath + ".ConnectionType", "PPPoE_Routed", "xsd:string"},
			[]any{connectionPath + ".X_CMCC_ServiceList", "INTERNET", "xsd:string"},
		)
	}

	if config.Name != "" {
		params = append(params, []any{connectionPath + ".Name", config.Name, "xsd:string"})
	}

	// Bindings: comma separated string
	var interfaceList []string
	for k, v := range config.Bindings {
		if !v {
			continue
		}
		if strings.HasPrefix(k, "lan") {
			interfaceList = append(interfaceList, "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig."+k[3:])
		} else if strings.HasPrefix(k, "ssid") {
			interfaceList = append(interfaceList, "InternetGatewayDevice.LANDevice.1.WLANConfiguration."+k[4:])
		}
	}
	if len(interfaceList) > 0 {
		params = append(params, []any{connectionPath + ".X_CMCC_LanInterface", strings.Join(interfaceList, ","), "xsd:string"})
	}

	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{"parameterValues": params}); err != nil {
		return nil, fmt.Errorf("set parameters: %w", err)
	}

	// Enable connection
	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{
		"parameterValues": [][]any{{connectionPath + ".Enable", "TRUE", "xsd:boolean"}},
	}); err != nil {
		return nil, fmt.Errorf("enable connection: %w", err)
	}

	_ = c.postTask(ctx, deviceID, "getParameterValues", map[string]any{
		"parameterNames": []string{connectionPath + ".Enable", connectionPath + ".ConnectionStatus"},
	})

	return &WANCreationResult{
		Success:         true,
		DeviceID:        deviceID,
		Vendor:          wanInfo.Vendor,
		ParameterPrefix: wanInfo.ParameterPrefix,
		ConnectionPath:  connectionPath,
		Verified:        true,
		Message:         "CMCC WAN connection created successfully",
	}, nil
}

// createWANConnection_FiberHome creates WAN on FiberHome ONTs.
func (c *Client) createWANConnection_FiberHome(ctx context.Context, deviceID string, connType string, config WANConnectionConfig, wanInfo *WANDeviceInfo) (*WANCreationResult, error) {
	// For FiberHome: find empty container >= 2 or create new container
	scanRes, err := c.scanWANConnectionDevices_FiberHome(ctx, deviceID)
	if err != nil {
		return nil, err
	}

	containerNum := scanRes.NextAvailable
	connectionPath := fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.WANPPPConnection.1", containerNum)
	objectName := fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.WANPPPConnection", containerNum)

	// Create container if not already existing
	containerExists := false
	for _, n := range scanRes.FoundNumbers {
		if n == containerNum {
			containerExists = true
			break
		}
	}

	if !containerExists {
		if err := c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice"}); err != nil {
			return nil, fmt.Errorf("create container: %w", err)
		}
		time.Sleep(2 * time.Second)
	}

	// Create WANPPPConnection inside container
	if err := c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": objectName}); err != nil {
		return nil, fmt.Errorf("create connection object: %w", err)
	}
	time.Sleep(2 * time.Second)

	vlanEnable := false
	if config.VlanID > 0 {
		vlanEnable = true
	}

	var params [][]any
	if connType == "bridge" {
		params = append(params,
			[]any{connectionPath + ".VLANID", config.VlanID, "xsd:int"},
			[]any{connectionPath + ".VLANEnable", vlanEnable, "xsd:boolean"},
			[]any{connectionPath + ".ConnectionType", "PPPoE_Bridged", "xsd:string"},
			[]any{connectionPath + ".X_FH_ServiceList", "OTHER", "xsd:string"},
			[]any{connectionPath + ".NATEnabled", false, "xsd:boolean"},
		)
	} else {
		params = append(params,
			[]any{connectionPath + ".VLANID", config.VlanID, "xsd:int"},
			[]any{connectionPath + ".VLANEnable", vlanEnable, "xsd:boolean"},
			[]any{connectionPath + ".Username", config.Username, "xsd:string"},
			[]any{connectionPath + ".Password", config.Password, "xsd:string"},
			[]any{connectionPath + ".ConnectionType", "IP_Routed", "xsd:string"},
			[]any{connectionPath + ".X_FH_ServiceList", "INTERNET", "xsd:string"},
			[]any{connectionPath + ".PPPoEACName", "GenieAcsPanel", "xsd:string"},
		)
	}

	if config.Name != "" {
		params = append(params, []any{connectionPath + ".Name", config.Name, "xsd:string"})
	}

	var interfaceList []string
	for k, v := range config.Bindings {
		if !v {
			continue
		}
		if strings.HasPrefix(k, "lan") {
			interfaceList = append(interfaceList, "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig."+k[3:])
		} else if strings.HasPrefix(k, "ssid") {
			interfaceList = append(interfaceList, "InternetGatewayDevice.LANDevice.1.WLANConfiguration."+k[4:])
		}
	}
	if len(interfaceList) > 0 {
		params = append(params, []any{connectionPath + ".X_FH_LanInterface", strings.Join(interfaceList, ","), "xsd:string"})
	}

	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{"parameterValues": params}); err != nil {
		return nil, fmt.Errorf("set parameters: %w", err)
	}

	// Enable connection
	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{
		"parameterValues": [][]any{{connectionPath + ".Enable", "true", "xsd:boolean"}},
	}); err != nil {
		return nil, fmt.Errorf("enable connection: %w", err)
	}

	_ = c.postTask(ctx, deviceID, "getParameterValues", map[string]any{
		"parameterNames": []string{connectionPath + ".Enable", connectionPath + ".ConnectionStatus"},
	})

	return &WANCreationResult{
		Success:         true,
		DeviceID:        deviceID,
		Vendor:          wanInfo.Vendor,
		ParameterPrefix: wanInfo.ParameterPrefix,
		ConnectionPath:  connectionPath,
		Verified:        true,
		Message:         "FiberHome WAN connection created successfully",
	}, nil
}

// createWANConnection_ZTECOM creates WAN on ZTE/X_ZTE-COM ONTs.
func (c *Client) createWANConnection_ZTECOM(ctx context.Context, deviceID string, connType string, config WANConnectionConfig, wanInfo *WANDeviceInfo) (*WANCreationResult, error) {
	// ZTE X_ZTE-COM hybrid: try to reuse available slot first, then fall back to new container
	slots := wanInfo.AvailableSlots.WanPPPConnections
	var connectionPath string
	var err error

	for _, slot := range slots {
		parentPath := slot[:strings.LastIndex(slot, ".")]
		if err = c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": parentPath}); err == nil {
			time.Sleep(2 * time.Second)
			verify, err := c.CheckWANDevice(ctx, nil, deviceID)
			if err == nil && contains(verify.WanPPPConnections, slot) {
				connectionPath = slot
				break
			}
		}
	}

	usingNewContainer := false
	if connectionPath == "" {
		// Fallback to new container
		scanRes, err := c.scanWANConnectionDevices_ZTECOM(ctx, deviceID)
		if err != nil {
			return nil, err
		}

		nextNum := scanRes.NextAvailable
		connectionPath = fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.WANPPPConnection.1", nextNum)

		if err := c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice"}); err != nil {
			return nil, fmt.Errorf("create container: %w", err)
		}
		time.Sleep(2 * time.Second)

		if err := c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.WANPPPConnection", nextNum)}); err != nil {
			return nil, fmt.Errorf("create connection: %w", err)
		}
		time.Sleep(2 * time.Second)
		usingNewContainer = true
	}

	var params [][]any
	if connType == "bridge" {
		params = append(params,
			[]any{connectionPath + ".Enable", true, "xsd:boolean"},
			[]any{connectionPath + ".ConnectionType", "PPPoE_Bridged", "xsd:string"},
			[]any{connectionPath + ".NATEnabled", false, "xsd:boolean"},
			[]any{connectionPath + ".X_ZTE-COM_ServiceList", "OTHER", "xsd:string"},
		)
	} else {
		params = append(params,
			[]any{connectionPath + ".Enable", true, "xsd:boolean"},
			[]any{connectionPath + ".ConnectionType", "IP_Routed", "xsd:string"},
			[]any{connectionPath + ".NATEnabled", true, "xsd:boolean"},
			[]any{connectionPath + ".X_ZTE-COM_ServiceList", "INTERNET", "xsd:string"},
			[]any{connectionPath + ".Username", config.Username, "xsd:string"},
			[]any{connectionPath + ".Password", config.Password, "xsd:string"},
		)
	}

	if config.Name != "" {
		params = append(params, []any{connectionPath + ".Name", config.Name, "xsd:string"})
	}

	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{"parameterValues": params}); err != nil {
		return nil, fmt.Errorf("set parameters: %w", err)
	}

	// VLAN
	vlanEnable := false
	if config.VlanID > 0 {
		vlanEnable = true
	}

	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{
		"parameterValues": [][]any{{connectionPath + ".X_ZTE-COM_VLANEnable", vlanEnable, "xsd:boolean"}},
	}); err != nil {
		return nil, fmt.Errorf("enable vlan: %w", err)
	}
	time.Sleep(1 * time.Second)

	if vlanEnable {
		if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{
			"parameterValues": [][]any{{connectionPath + ".X_ZTE-COM_VLANID", config.VlanID, "xsd:int"}},
		}); err != nil {
			return nil, fmt.Errorf("set vlan ID: %w", err)
		}
		time.Sleep(1 * time.Second)
	}

	// Port binding
	bindingScan, err := c.scanPortBindings_ZTECOM(ctx, deviceID)
	if err != nil {
		return nil, err
	}

	bindingIdx := bindingScan.NextAvailable
	bindingPath := fmt.Sprintf("InternetGatewayDevice.X_ZTE-COM_PortBinding.%d", bindingIdx)

	if err := c.postTask(ctx, deviceID, "addObject", map[string]any{"objectName": "InternetGatewayDevice.X_ZTE-COM_PortBinding"}); err != nil {
		return nil, fmt.Errorf("create port binding object: %w", err)
	}
	time.Sleep(2 * time.Second)

	// Set PortBinding WAN
	if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{
		"parameterValues": [][]any{{bindingPath + ".WANInterface", connectionPath, "xsd:string"}},
	}); err != nil {
		return nil, fmt.Errorf("set port binding WANInterface: %w", err)
	}
	time.Sleep(1 * time.Second)

	var interfaceList []string
	for k, v := range config.Bindings {
		if !v {
			continue
		}
		if strings.HasPrefix(k, "lan") {
			interfaceList = append(interfaceList, "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig."+k[3:])
		} else if strings.HasPrefix(k, "ssid") {
			interfaceList = append(interfaceList, "InternetGatewayDevice.LANDevice.1.WLANConfiguration."+k[4:])
		}
	}

	if len(interfaceList) > 0 {
		lanStr := strings.Join(interfaceList, ",")
		if err := c.postTask(ctx, deviceID, "setParameterValues", map[string]any{
			"parameterValues": [][]any{{bindingPath + ".LANInterface", lanStr, "xsd:string"}},
		}); err != nil {
			return nil, fmt.Errorf("set port binding LANInterface: %w", err)
		}
		time.Sleep(1 * time.Second)
	}

	_ = c.postTask(ctx, deviceID, "getParameterValues", map[string]any{
		"parameterNames": []string{
			connectionPath + ".Enable",
			connectionPath + ".ConnectionStatus",
			connectionPath + ".X_ZTE-COM_VLANID",
			connectionPath + ".X_ZTE-COM_VLANEnable",
			bindingPath + ".WANInterface",
			bindingPath + ".LANInterface",
		},
	})

	method := "Existing Container"
	if usingNewContainer {
		method = "New Container"
	}

	return &WANCreationResult{
		Success:         true,
		DeviceID:        deviceID,
		Vendor:          wanInfo.Vendor,
		ParameterPrefix: wanInfo.ParameterPrefix,
		ConnectionPath:  connectionPath,
		Verified:        true,
		Message:         fmt.Sprintf("ZTE WAN connection created successfully via %s", method),
	}, nil
}

// scanWANConnectionDevices_FiberHome scans FiberHome devices to find empty container starting from 2.
func (c *Client) scanWANConnectionDevices_FiberHome(ctx context.Context, deviceID string) (*FiberHomeScanResult, error) {
	projection := []string{"_id", "InternetGatewayDevice.WANDevice"}
	queryJSON := fmt.Sprintf(`{"_id":"%s"}`, deviceID)
	reqURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", c.BaseURL, url.QueryEscape(queryJSON), url.QueryEscape(strings.Join(projection, ",")))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get device details returned: %d", resp.StatusCode)
	}

	var devices []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil {
		return nil, err
	}
	if len(devices) == 0 {
		return nil, fmt.Errorf("device not found")
	}

	dev := devices[0]
	igd := getNestedMap(dev, "InternetGatewayDevice")
	wanDevices := getNestedMap(igd, "WANDevice")
	cleanedWanDevicesRaw := CleanGenieACSData(wanDevices)

	var foundNumbers []int
	var emptyContainers []int
	var usedContainers []int

	if cleanedWanDevices, ok := cleanedWanDevicesRaw.(map[string]any); ok {
		if wanDevice1, ok := cleanedWanDevices["1"].(map[string]any); ok {
			wanConnDevs := getNestedMap(wanDevice1, "WANConnectionDevice")
			for numStr, containerRaw := range wanConnDevs {
				num, _ := strconv.Atoi(numStr)
				container, ok := containerRaw.(map[string]any)
				if !ok {
					continue
				}

				hasIP := false
				if ip := getNestedMap(container, "WANIPConnection"); len(ip) > 0 {
					hasIP = true
				}
				hasPPP := false
				if ppp := getNestedMap(container, "WANPPPConnection"); len(ppp) > 0 {
					hasPPP = true
				}

				foundNumbers = append(foundNumbers, num)
				if hasIP || hasPPP {
					usedContainers = append(usedContainers, num)
				} else if num >= 2 {
					emptyContainers = append(emptyContainers, num)
				}
			}
		}
	}

	nextAvailable := 2
	if len(emptyContainers) > 0 {
		nextAvailable = minInt(emptyContainers)
	} else {
		for containsInt(usedContainers, nextAvailable) {
			nextAvailable++
		}
	}

	return &FiberHomeScanResult{
		FoundNumbers:    foundNumbers,
		EmptyContainers: emptyContainers,
		UsedContainers:  usedContainers,
		NextAvailable:   nextAvailable,
	}, nil
}

type FiberHomeScanResult struct {
	FoundNumbers    []int
	EmptyContainers []int
	UsedContainers  []int
	NextAvailable   int
}

// scanWANConnectionDevices_ZTECOM scans WANDevices for ZTE F670L/F609.
func (c *Client) scanWANConnectionDevices_ZTECOM(ctx context.Context, deviceID string) (*ZTEScanResult, error) {
	projection := []string{"_id", "InternetGatewayDevice.WANDevice"}
	queryJSON := fmt.Sprintf(`{"_id":"%s"}`, deviceID)
	reqURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", c.BaseURL, url.QueryEscape(queryJSON), url.QueryEscape(strings.Join(projection, ",")))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var devices []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil {
		return nil, err
	}
	if len(devices) == 0 {
		return nil, fmt.Errorf("device not found")
	}

	dev := devices[0]
	igd := getNestedMap(dev, "InternetGatewayDevice")
	wanDevices := getNestedMap(igd, "WANDevice")
	cleanedWanDevicesRaw := CleanGenieACSData(wanDevices)

	var foundNumbers []int
	if cleanedWanDevices, ok := cleanedWanDevicesRaw.(map[string]any); ok {
		if wanDevice1, ok := cleanedWanDevices["1"].(map[string]any); ok {
			wanConnDevs := getNestedMap(wanDevice1, "WANConnectionDevice")
			for numStr := range wanConnDevs {
				num, _ := strconv.Atoi(numStr)
				foundNumbers = append(foundNumbers, num)
			}
		}
	}

	nextAvailable := 1
	for containsInt(foundNumbers, nextAvailable) {
		nextAvailable++
	}

	return &ZTEScanResult{
		FoundNumbers:  foundNumbers,
		NextAvailable: nextAvailable,
	}, nil
}

type ZTEScanResult struct {
	FoundNumbers  []int
	NextAvailable int
}

// scanPortBindings_ZTECOM finds next available PortBinding index.
func (c *Client) scanPortBindings_ZTECOM(ctx context.Context, deviceID string) (*ZTEScanResult, error) {
	projection := []string{"_id", "InternetGatewayDevice.X_ZTE-COM_PortBinding"}
	queryJSON := fmt.Sprintf(`{"_id":"%s"}`, deviceID)
	reqURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", c.BaseURL, url.QueryEscape(queryJSON), url.QueryEscape(strings.Join(projection, ",")))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var foundNumbers []int
	if resp.StatusCode == http.StatusOK {
		var devices []map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&devices); err == nil && len(devices) > 0 {
			dev := devices[0]
			igd := getNestedMap(dev, "InternetGatewayDevice")
			if bindings := getNestedMap(igd, "X_ZTE-COM_PortBinding"); bindings != nil {
				for numStr := range bindings {
					num, _ := strconv.Atoi(numStr)
					foundNumbers = append(foundNumbers, num)
				}
			}
		}
	}

	nextAvailable := 1
	for containsInt(foundNumbers, nextAvailable) {
		nextAvailable++
	}

	return &ZTEScanResult{
		FoundNumbers:  foundNumbers,
		NextAvailable: nextAvailable,
	}, nil
}

// DeleteWANConnection removes a WAN connection safely, protecting TR-069.
func (c *Client) DeleteWANConnection(ctx context.Context, db *sql.DB, deviceID string, objectPath string, name string) (*WANDeletionResult, error) {
	if deviceID == "" || objectPath == "" {
		return nil, fmt.Errorf("device ID and object path are required")
	}

	// Parse connection path: WANDevice.1.WANConnectionDevice.<id>.(WANPPPConnection|WANIPConnection).<idx>
	parts := strings.Split(objectPath, ".")
	if len(parts) < 7 {
		return nil, fmt.Errorf("invalid WAN connection path format: %s", objectPath)
	}

	containerIndex := parts[4]
	connType := parts[5]
	connIndex := parts[6]

	// Step 1: Scan container connections and check if target is TR-069
	containerPath := fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%s", containerIndex)
	projection := []string{
		"_id",
		"_deviceId._ProductClass",
		"_deviceId._SerialNumber",
		"_deviceId._Manufacturer",
		containerPath,
	}

	queryJSON := fmt.Sprintf(`{"_id":"%s"}`, deviceID)
	reqURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", c.BaseURL, url.QueryEscape(queryJSON), url.QueryEscape(strings.Join(projection, ",")))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get device details returned: %d", resp.StatusCode)
	}

	var devices []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil {
		return nil, err
	}
	if len(devices) == 0 {
		return nil, fmt.Errorf("device not found")
	}

	dev := devices[0]
	var manufacturer, productClass string
	if devID, ok := dev["_deviceId"].(map[string]any); ok {
		if m, ok := devID["_Manufacturer"].(string); ok {
			manufacturer = m
		}
		if p, ok := devID["_ProductClass"].(string); ok {
			productClass = p
		}
	}

	vendorObj, err := DetectVendor(ctx, db, manufacturer, productClass, dev)
	if err != nil {
		return nil, err
	}

	vendorPrefix := ""
	if vendorObj != nil {
		vendorPrefix = vendorObj.ParameterPrefix
	}

	igd := getNestedMap(dev, "InternetGatewayDevice")
	wanDevice1 := getNestedMap(igd, "WANDevice", "1")
	containerRaw := getNestedMap(wanDevice1, "WANConnectionDevice", containerIndex)
	containerCleanRaw := CleanGenieACSData(containerRaw)

	container, ok := containerCleanRaw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("container WANConnectionDevice.%s not found", containerIndex)
	}

	// Scan container contents and identify TR-069
	var connections []map[string]any
	hasTR069 := false
	targetIsTR069 := false

	scanConnections := func(subKey string) {
		conns := getNestedMap(container, subKey)
		for idx, connRaw := range conns {
			conn, ok := connRaw.(map[string]any)
			if !ok {
				continue
			}

			// Service list paths
			serviceList := ""
			if vendorPrefix != "" && vendorObj.ServiceListPath != "" {
				serviceList = getNestedString(conn, vendorObj.ServiceListPath)
			}
			if serviceList == "" {
				serviceList = getNestedString(conn, "X_HW_SERVICELIST")
			}
			if serviceList == "" {
				serviceList = getNestedString(conn, "X_CMCC_ServiceList")
			}
			if serviceList == "" {
				serviceList = getNestedString(conn, "X_FH_ServiceList")
			}
			if serviceList == "" {
				serviceList = getNestedString(conn, "X_ZTE-COM_ServiceList")
			}
			if serviceList == "" {
				serviceList = getNestedString(conn, "X_CT-COM_ServiceList")
			}

			isTR069 := isTR069ServiceList(serviceList)
			connections = append(connections, map[string]any{
				"type":     subKey,
				"index":    idx,
				"isTR069":  isTR069,
				"service":  serviceList,
				"fullPath": fmt.Sprintf("%s.%s.%s", containerPath, subKey, idx),
			})

			if isTR069 {
				hasTR069 = true
			}

			if subKey == connType && idx == connIndex && isTR069 {
				targetIsTR069 = true
			}
		}
	}

	scanConnections("WANIPConnection")
	scanConnections("WANPPPConnection")

	if targetIsTR069 {
		return nil, fmt.Errorf("cannot delete TR-069 management connection. this connection is required for device management")
	}

	deleteTarget := objectPath
	deletionType := "PARTIAL_CONNECTION"

	// Smart deletion: if container contains only 1 connection and it is NOT TR-069, delete the whole container!
	if len(connections) == 1 && !hasTR069 {
		deleteTarget = containerPath
		deletionType = "FULL_CONTAINER"
	}

	// Execute deletion
	if err := c.postTask(ctx, deviceID, "deleteObject", map[string]any{"objectName": deleteTarget}); err != nil {
		return nil, fmt.Errorf("post delete task: %w", err)
	}

	time.Sleep(1 * time.Second)

	return &WANDeletionResult{
		Success:      true,
		Message:      fmt.Sprintf("WAN connection deleted successfully (method: %s)", deletionType),
		DeviceID:     deviceID,
		DeletedPath:  deleteTarget,
		DeletedName:  name,
		DeletionType: deletionType,
	}, nil
}

// postTask helper issues a task to GenieACS.
func (c *Client) postTask(ctx context.Context, deviceID string, name string, taskBody map[string]any) error {
	taskBody["name"] = name
	bodyBytes, err := json.Marshal(taskBody)
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("%s/devices/%s/tasks?connection_request", c.BaseURL, url.PathEscape(deviceID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("genieacs returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func isTR069ServiceList(serviceList string) bool {
	if serviceList == "" {
		return false
	}
	norm := strings.ToUpper(strings.TrimSpace(serviceList))
	return strings.Contains(norm, "TR069") || strings.Contains(norm, "TR-069") || strings.Contains(norm, "INTERNET_TR069")
}

func getNestedMap(m map[string]any, keys ...string) map[string]any {
	curr := m
	for _, k := range keys {
		val, ok := curr[k]
		if !ok {
			return nil
		}
		next, ok := val.(map[string]any)
		if !ok {
			return nil
		}
		curr = next
	}
	return curr
}

func maxInt(slice []int) int {
	if len(slice) == 0 {
		return 0
	}
	max := slice[0]
	for _, v := range slice {
		if v > max {
			max = v
		}
	}
	return max
}

func minInt(slice []int) int {
	if len(slice) == 0 {
		return 0
	}
	min := slice[0]
	for _, v := range slice {
		if v < min {
			min = v
		}
	}
	return min
}

func contains(slice []string, s string) bool {
	for _, item := range slice {
		if item == s {
			return true
		}
	}
	return false
}

func containsInt(slice []int, n int) bool {
	for _, item := range slice {
		if item == n {
			return true
		}
	}
	return false
}

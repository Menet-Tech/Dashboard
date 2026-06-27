package acs

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type DashboardData struct {
	Metrics              []DashboardMetric      `json:"metrics"`
	ConnectionHistory    ConnectionHistory      `json:"connectionHistory"`
	ConnectionTypes      []ConnectionTypeItem   `json:"connectionTypes"`
	ConnectionTypesChart ConnectionTypesChart   `json:"connectionTypesChart"`
	Events               []DashboardEvent       `json:"events"`
	RecentDevices        []DashboardRecentDevice `json:"recentDevices"`
	RxPowerDistribution  RxPowerDistribution    `json:"rxPowerDistribution"`
}

type DashboardMetric struct {
	Name   string `json:"name"`
	Value  int    `json:"value"`
	Status string `json:"status"` // "up", "down", "warning"
	Change int    `json:"change"`
}

type ConnectionHistory struct {
	Labels []string           `json:"labels"`
	Series []ConnectionSeries `json:"series"`
}

type ConnectionSeries struct {
	Name string `json:"name"`
	Data []int  `json:"data"`
}

type ConnectionTypeItem struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type ConnectionTypesChart struct {
	Labels       []string           `json:"labels"`
	Series       []ConnectionSeries `json:"series"`
	Colors       []string           `json:"colors"`
	TotalDevices int                `json:"totalDevices"`
}

type DashboardEvent struct {
	ID    int    `json:"id"`
	Event string `json:"event"`
	Count int    `json:"count"`
}

type DashboardRecentDevice struct {
	ID            string `json:"id"`
	Model         string `json:"model"`
	Serial        string `json:"serial"`
	ProvisionDate string `json:"provisionDate"`
}

type RxPowerDistribution struct {
	Labels       []string `json:"labels"`
	Series       []int    `json:"series"` // [Excellent, Fair, Poor, N/A]
	Colors       []string `json:"colors"`
	TotalDevices int      `json:"totalDevices"`
}

// GetDashboardData aggregates metrics from GenieACS in parallel.
func (c *Client) GetDashboardData(ctx context.Context, db *sql.DB) (*DashboardData, error) {
	// 1. Fetch settings from DB
	vpRxPower := "VirtualParameters.RXPower"
	deviceOnlineThreshold := 600000 // default 10 minutes (in ms)
	excellentThreshold := -21.0
	fairThreshold := -25.0

	if db != nil {
		var val string
		if err := db.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'vpRxPower' LIMIT 1").Scan(&val); err == nil && val != "" {
			vpRxPower = val
		}
		
		// Load refresh intervals / thresholds
		var intervalsStr string
		if err := db.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'autoRefreshIntervals' LIMIT 1").Scan(&intervalsStr); err == nil && intervalsStr != "" {
			var m map[string]any
			if json.Unmarshal([]byte(intervalsStr), &m) == nil {
				if t, ok := m["deviceOnlineThreshold"].(float64); ok {
					if t > 1000 {
						deviceOnlineThreshold = int(t)
					} else {
						deviceOnlineThreshold = int(t * 60000)
					}
				}
			}
		}

		var rxThresholdsStr string
		if err := db.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'rxPowerThresholds' LIMIT 1").Scan(&rxThresholdsStr); err == nil && rxThresholdsStr != "" {
			var t struct {
				Excellent float64 `json:"excellent"`
				Fair      float64 `json:"fair"`
			}
			if json.Unmarshal([]byte(rxThresholdsStr), &t) == nil {
				excellentThreshold = t.Excellent
				fairThreshold = t.Fair
			}
		}
	}

	// Clean BaseURL
	baseURL := strings.TrimSuffix(c.BaseURL, "/")

	// If unconfigured or points to mock, return mock dashboard data
	if baseURL == "" || strings.Contains(strings.ToLower(baseURL), "mock") || strings.Contains(strings.ToLower(baseURL), "localhost") {
		return getMockDashboardData(), nil
	}

	// 2. Fetch from GenieACS in parallel
	var wg sync.WaitGroup
	var errs []error
	var errMu sync.Mutex

	var devices []map[string]any
	var faults []map[string]any
	var tasks []map[string]any

	fetchJSON := func(endpoint string, dest *[]map[string]any) {
		defer wg.Done()
		reqURL := baseURL + endpoint
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			errMu.Lock()
			errs = append(errs, err)
			errMu.Unlock()
			return
		}

		if c.Username != "" {
			req.SetBasicAuth(c.Username, c.Password)
		}

		resp, err := c.Client.Do(req)
		if err != nil {
			errMu.Lock()
			errs = append(errs, err)
			errMu.Unlock()
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			errMu.Lock()
			errs = append(errs, fmt.Errorf("genieacs returned status %d on %s: %s", resp.StatusCode, endpoint, string(body)))
			errMu.Unlock()
			return
		}

		if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
			errMu.Lock()
			errs = append(errs, err)
			errMu.Unlock()
		}
	}

	wg.Add(3)
	devicesProj := fmt.Sprintf("/devices?projection=_id,_deviceId._ProductClass,_deviceId._SerialNumber,_lastInform,%s", vpRxPower)
	go fetchJSON(devicesProj, &devices)
	go fetchJSON("/faults", &faults)
	go fetchJSON("/tasks", &tasks)

	wg.Wait()

	if len(errs) > 0 {
		return nil, fmt.Errorf("parallel dashboard fetch: %v", errs[0])
	}

	// 3. Process metrics
	totalDevices := len(devices)
	onlineDevices := 0
	thresholdAgo := time.Now().Add(-time.Duration(deviceOnlineThreshold) * time.Millisecond)

	for _, d := range devices {
		if liStr, ok := d["_lastInform"].(string); ok {
			if t, err := time.Parse(time.RFC3339, liStr); err == nil {
				if t.After(thresholdAgo) {
					onlineDevices++
				}
			}
		}
	}

	offlineDevices := totalDevices - onlineDevices
	faultsCount := len(faults)

	// Simulated change percentages
	rand.Seed(time.Now().UnixNano())
	metrics := []DashboardMetric{
		{Name: "Total Devices", Value: totalDevices, Status: "up", Change: rand.Intn(20) - 10},
		{Name: "Online", Value: onlineDevices, Status: "up", Change: rand.Intn(16) - 8},
		{Name: "Offline", Value: offlineDevices, Status: "down", Change: rand.Intn(14) - 7},
		{Name: "Faults", Value: faultsCount, Status: "warning", Change: rand.Intn(10) - 5},
	}

	// 4. Process product classes (connection types)
	productClasses := make(map[string]int)
	for _, d := range devices {
		pc := "Unknown"
		if devID, ok := d["_deviceId"].(map[string]any); ok {
			if pcVal := getStringFromMap(devID, "_ProductClass"); pcVal != "" {
				pc = pcVal
			}
		}
		productClasses[pc]++
	}

	var connTypes []ConnectionTypeItem
	for name, val := range productClasses {
		connTypes = append(connTypes, ConnectionTypeItem{Name: name, Value: val})
	}
	// Sort by count descending
	sort.Slice(connTypes, func(i, j int) bool {
		return connTypes[i].Value > connTypes[j].Value
	})

	var chartLabels []string
	var chartValues []int
	for _, ct := range connTypes {
		chartLabels = append(chartLabels, ct.Name)
		chartValues = append(chartValues, ct.Value)
	}

	baseColors := []string{
		"#4B72B0", "#BF6F50", "#55A868", "#C44E52", "#8172B0",
		"#BA68C8", "#4FC3F7", "#FFB74D", "#81C784", "#FF8A65",
	}
	var colors []string
	for i := range connTypes {
		colors = append(colors, baseColors[i%len(baseColors)])
	}

	chartData := ConnectionTypesChart{
		Labels:       chartLabels,
		Series:       []ConnectionSeries{{Name: "Devices", Data: chartValues}},
		Colors:       colors,
		TotalDevices: totalDevices,
	}

	// 5. Process events (tasks count)
	taskCounts := make(map[string]int)
	for _, t := range tasks {
		name := "Unknown"
		if nVal, ok := t["name"].(string); ok {
			name = nVal
		}
		taskCounts[name]++
	}

	var events []DashboardEvent
	idCounter := 1
	for name, val := range taskCounts {
		events = append(events, DashboardEvent{ID: idCounter, Event: name, Count: val})
		idCounter++
	}
	sort.Slice(events, func(i, j int) bool {
		return events[i].Count > events[j].Count
	})
	if len(events) > 5 {
		events = events[:5]
	}
	// Pad if less than 5
	defaultEvents := []string{"Device Boot", "Periodic Inform", "Value Change", "Connection Request", "Diagnostics Complete"}
	for len(events) < 5 {
		events = append(events, DashboardEvent{
			ID:    idCounter,
			Event: defaultEvents[len(events)%len(defaultEvents)],
			Count: 0,
		})
		idCounter++
	}

	// 6. Recent devices (sorted by _lastInform descending)
	type devSort struct {
		device map[string]any
		t      time.Time
	}
	var sorted []devSort
	for _, d := range devices {
		tVal := time.Unix(0, 0)
		if liStr, ok := d["_lastInform"].(string); ok {
			if t, err := time.Parse(time.RFC3339, liStr); err == nil {
				tVal = t
			}
		}
		sorted = append(sorted, devSort{device: d, t: tVal})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].t.After(sorted[j].t)
	})

	var recentDevices []DashboardRecentDevice
	for idx, sDev := range sorted {
		if idx >= 5 {
			break
		}
		id := getStringFromMap(sDev.device, "_id")
		model := "Unknown"
		serial := "Unknown"
		if devID, ok := sDev.device["_deviceId"].(map[string]any); ok {
			model = getStringFromMap(devID, "_ProductClass")
			serial = getStringFromMap(devID, "_SerialNumber")
		}
		provision := "Unknown"
		if !sDev.t.Equal(time.Unix(0, 0)) {
			provision = sDev.t.Format("2006-01-02")
		}
		recentDevices = append(recentDevices, DashboardRecentDevice{
			ID:            id,
			Model:         model,
			Serial:        serial,
			ProvisionDate: provision,
		})
	}

	// 7. RX Power distribution
	var rxPowerData struct {
		excellent int
		fair      int
		poor      int
		na        int
	}

	for _, d := range devices {
		rxVal := getNestedStringFromPath(d, vpRxPower)
		if rxVal == "" {
			rxPowerData.na++
			continue
		}
		val, err := strconv.ParseFloat(rxVal, 64)
		if err != nil {
			rxPowerData.na++
		} else if val >= excellentThreshold {
			rxPowerData.excellent++
		} else if val >= fairThreshold {
			rxPowerData.fair++
		} else {
			rxPowerData.poor++
		}
	}

	rxDistribution := RxPowerDistribution{
		Labels: []string{"Excellent", "Fair", "Poor", "N/A"},
		Series: []int{
			rxPowerData.excellent,
			rxPowerData.fair,
			rxPowerData.poor,
			rxPowerData.na,
		},
		Colors: []string{
			"#10B981", // green-500
			"#FBBF24", // yellow-400
			"#EF4444", // red-500
			"#9CA3AF", // gray-400
		},
		TotalDevices: totalDevices,
	}

	// 8. Connection history last 7 days (mocked)
	var days []string
	var connections []int
	var disconnections []int
	for i := 6; i >= 0; i-- {
		t := time.Now().AddDate(0, 0, -i)
		days = append(days, t.Format("Mon"))
		connections = append(connections, rand.Intn(150)+50)
		disconnections = append(disconnections, rand.Intn(50)+20)
	}

	connectionHistory := ConnectionHistory{
		Labels: days,
		Series: []ConnectionSeries{
			{Name: "Connections", Data: connections},
			{Name: "Disconnections", Data: disconnections},
		},
	}

	return &DashboardData{
		Metrics:              metrics,
		ConnectionHistory:    connectionHistory,
		ConnectionTypes:      connTypes,
		ConnectionTypesChart: chartData,
		Events:               events,
		RecentDevices:        recentDevices,
		RxPowerDistribution:  rxDistribution,
	}, nil
}

func getMockDashboardData() *DashboardData {
	rand.Seed(time.Now().UnixNano())
	days := []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
	connections := []int{50, 60, 55, 70, 65, 80, 75}
	disconnections := []int{20, 25, 22, 30, 28, 35, 32}

	metrics := []DashboardMetric{
		{Name: "Total Devices", Value: 18, Status: "up", Change: 3},
		{Name: "Online", Value: 16, Status: "up", Change: 2},
		{Name: "Offline", Value: 2, Status: "down", Change: 1},
		{Name: "Faults", Value: 0, Status: "up", Change: 0},
	}

	return &DashboardData{
		Metrics: metrics,
		ConnectionHistory: ConnectionHistory{
			Labels: days,
			Series: []ConnectionSeries{
				{Name: "Connections", Data: connections},
				{Name: "Disconnections", Data: disconnections},
			},
		},
		ConnectionTypes: []ConnectionTypeItem{
			{Name: "F609", Value: 8},
			{Name: "HG8245H", Value: 6},
			{Name: "HG6243C", Value: 4},
		},
		ConnectionTypesChart: ConnectionTypesChart{
			Labels: []string{"F609", "HG8245H", "HG6243C"},
			Series: []ConnectionSeries{
				{Name: "Devices", Data: []int{8, 6, 4}},
			},
			Colors:       []string{"#4B72B0", "#BF6F50", "#55A868"},
			TotalDevices: 18,
		},
		Events: []DashboardEvent{
			{ID: 1, Event: "Periodic Inform", Count: 120},
			{ID: 2, Event: "Value Change", Count: 45},
			{ID: 3, Event: "Device Boot", Count: 12},
			{ID: 4, Event: "Connection Request", Count: 8},
			{ID: 5, Event: "Diagnostics Complete", Count: 2},
		},
		RecentDevices: []DashboardRecentDevice{
			{ID: "mock-id-1", Model: "F609", Serial: "ZTEGC1234567", ProvisionDate: "2026-06-08"},
			{ID: "mock-id-2", Model: "HG8245H", Serial: "HWTC98765432", ProvisionDate: "2026-06-08"},
			{ID: "mock-id-3", Model: "HG6243C", Serial: "FHTT00112233", ProvisionDate: "2026-06-07"},
		},
		RxPowerDistribution: RxPowerDistribution{
			Labels:       []string{"Excellent", "Fair", "Poor", "N/A"},
			Series:       []int{12, 4, 1, 1},
			Colors:       []string{"#10B981", "#FBBF24", "#EF4444", "#9CA3AF"},
			TotalDevices: 18,
		},
	}
}

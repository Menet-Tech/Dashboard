package mikrotik

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
)

type TrafficPoller struct {
	routerService *RouterService
	mu            sync.RWMutex
	rates         map[string]TrafficStats // maps lowercased username -> Tx/Rx rates
	lastBytes     map[string]interfaceSnap
	clients       map[int64]*Client // maps Router.ID -> persistent *Client
	running       map[int64]bool    // maps Router.ID -> is currently polling?
}

type interfaceSnap struct {
	rxBytes int64
	txBytes int64
	time    time.Time
}

func NewTrafficPoller(routerService *RouterService) *TrafficPoller {
	return &TrafficPoller{
		routerService: routerService,
		rates:         make(map[string]TrafficStats),
		lastBytes:     make(map[string]interfaceSnap),
		clients:       make(map[int64]*Client),
		running:       make(map[int64]bool),
	}
}

// GetStats returns the traffic stats for a username.
func (p *TrafficPoller) GetStats(username string) TrafficStats {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.rates[strings.ToLower(strings.TrimSpace(username))]
}

// GetAllStats returns a copy of all current traffic stats.
func (p *TrafficPoller) GetAllStats() map[string]TrafficStats {
	p.mu.RLock()
	defer p.mu.RUnlock()
	copyMap := make(map[string]TrafficStats, len(p.rates))
	for k, v := range p.rates {
		copyMap[k] = v
	}
	return copyMap
}

// Start runs the polling loop.
func (p *TrafficPoller) Start(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	slog.Info("MikroTik traffic poller started", "interval", interval)

	for {
		select {
		case <-ctx.Done():
			slog.Info("MikroTik traffic poller stopped")
			// Close all active clients on exit
			p.mu.Lock()
			for _, client := range p.clients {
				client.Close()
			}
			p.mu.Unlock()
			return
		case <-ticker.C:
			p.pollOnce(ctx)
		}
	}
}

func (p *TrafficPoller) pollOnce(ctx context.Context) {
	routers, err := p.routerService.ListActive(ctx)
	if err != nil {
		slog.Error("traffic poller: failed to get active routers", "error", err)
		return
	}

	p.mu.Lock()
	// Clean up client connections for routers that are no longer active
	activeIDs := make(map[int64]bool)
	for _, r := range routers {
		activeIDs[r.ID] = true
	}
	for id, client := range p.clients {
		if !activeIDs[id] {
			client.Close()
			delete(p.clients, id)
		}
	}
	p.mu.Unlock()

	for _, router := range routers {
		p.mu.Lock()
		if p.running[router.ID] {
			p.mu.Unlock()
			continue // skip this cycle if previous query is still running
		}
		p.running[router.ID] = true

		client, exists := p.clients[router.ID]
		// Recreate client if configuration has changed
		if !exists || client.Host != router.Host || client.Username != router.Username || client.Password != router.Password {
			if exists {
				client.Close()
			}
			client = NewClient(router.Host, router.Username, router.Password)
			p.clients[router.ID] = client
		}
		p.mu.Unlock()

		go func(r Router, cl *Client) {
			defer func() {
				p.mu.Lock()
				p.running[r.ID] = false
				p.mu.Unlock()
			}()

			pollCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancel()

			// Connect if not already connected
			if cl.conn == nil {
				if err := cl.Connect(pollCtx); err != nil {
					return
				}
				slog.Info("traffic poller: successfully established persistent connection", "router", r.Name, "host", r.Host)
			}

			reply, err := cl.run(pollCtx, "/interface/print", "=.proplist=name,rx-byte,tx-byte")
			if err != nil {
				// Connection died, close it so we reconnect in the next cycle
				cl.Close()
				return
			}

			now := time.Now()

			for _, sentence := range reply {
				var ifaceName string
				var rxByte, txByte int64
				hasRe := false
				for _, word := range sentence {
					if word == "!re" {
						hasRe = true
					}
					if strings.HasPrefix(word, "=name=") {
						ifaceName = strings.TrimPrefix(word, "=name=")
					} else if strings.HasPrefix(word, "=rx-byte=") {
						fmt.Sscanf(strings.TrimPrefix(word, "=rx-byte="), "%d", &rxByte)
					} else if strings.HasPrefix(word, "=tx-byte=") {
						fmt.Sscanf(strings.TrimPrefix(word, "=tx-byte="), "%d", &txByte)
					}
				}

				if !hasRe || ifaceName == "" {
					continue
				}

				key := strings.ToLower(r.Host + "/" + ifaceName)

				p.mu.Lock()
				prev, exists := p.lastBytes[key]
				p.lastBytes[key] = interfaceSnap{
					rxBytes: rxByte,
					txBytes: txByte,
					time:    now,
				}

				if exists {
					dt := now.Sub(prev.time).Seconds()
					if dt > 0.1 {
						rxRate := int64(float64(txByte-prev.txBytes) / dt * 8)
						txRate := int64(float64(rxByte-prev.rxBytes) / dt * 8)
						if rxRate < 0 {
							rxRate = 0
						}
						if txRate < 0 {
							txRate = 0
						}

						username := extractPPPoEUser(ifaceName)
						if username != "" {
							p.rates[strings.ToLower(username)] = TrafficStats{
								RxRate: rxRate,
								TxRate: txRate,
							}
						}
					}
				}
				p.mu.Unlock()
			}
		}(router, client)
	}
}

func extractPPPoEUser(ifaceName string) string {
	lower := strings.ToLower(ifaceName)
	if strings.HasPrefix(lower, "<pppoe-") && strings.HasSuffix(lower, ">") {
		return ifaceName[7 : len(ifaceName)-1]
	}
	if strings.HasPrefix(lower, "pppoe-") {
		return ifaceName[6:]
	}
	return ifaceName
}

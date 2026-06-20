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

	for _, router := range routers {
		go func(r Router) {
			pollCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			client := NewClient(r.Host, r.Username, r.Password)
			if err := client.Connect(pollCtx); err != nil {
				// Silently fail connection to avoid spamming logs
				return
			}
			defer client.Close()

			reply, err := client.run(pollCtx, "/interface/print", "=.proplist=name,rx-byte,tx-byte")
			if err != nil {
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
						// Note: rx-byte is download for client from client's perspective, 
						// but from router's perspective:
						// Tx (transmit) from router is client's Rx (receive/download).
						// Rx (receive) to router is client's Tx (transmit/upload).
						// So:
						// Client Rx (download) = Router Tx
						// Client Tx (upload) = Router Rx
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
		}(router)
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

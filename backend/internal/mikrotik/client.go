package mikrotik

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// PPPoESecret represents a PPPoE secret entry from RouterOS /ppp/secret/print.
type PPPoESecret struct {
	Name     string
	Password string
	Profile  string
	Disabled bool
}

// Client is a minimal RouterOS API client using the RouterOS API protocol (port 8728).
// This implementation uses the raw RouterOS API sentence format, no external library required.
type Client struct {
	Host     string
	Username string
	Password string
	Timeout  time.Duration

	conn net.Conn
}

func NewClient(host, username, password string) *Client {
	return &Client{
		Host:     host,
		Username: username,
		Password: password,
		Timeout:  10 * time.Second,
	}
}

// Connect opens a TCP connection to the RouterOS API port and authenticates.
func (c *Client) Connect(ctx context.Context) error {
	addr := c.Host
	if !strings.Contains(addr, ":") {
		addr = addr + ":8728"
	}

	dialer := net.Dialer{Timeout: c.Timeout}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("mikrotik connect %s: %w", addr, err)
	}
	c.conn = conn

	if err := c.login(ctx); err != nil {
		_ = c.conn.Close()
		c.conn = nil
		return fmt.Errorf("mikrotik login: %w", err)
	}

	return nil
}

// Close closes the connection.
func (c *Client) Close() {
	if c.conn != nil {
		_ = c.conn.Close()
		c.conn = nil
	}
}

// LimitUser adds or updates a PPPoE user in the Secrets table to restrict their profile.
// Returns an error if the user is not found or operation fails.
func (c *Client) LimitUser(ctx context.Context, username, profile string) error {
	if c.conn == nil {
		return fmt.Errorf("not connected to RouterOS")
	}

	// Find the secret ID
	reply, err := c.run(ctx,
		"/ppp/secret/print",
		"?name="+username,
	)
	if err != nil {
		return fmt.Errorf("find ppp secret %q: %w", username, err)
	}

	if len(reply) == 0 || !hasDone(reply) {
		return fmt.Errorf("ppp secret %q not found", username)
	}

	id := extractField(reply, ".id")
	if id == "" {
		return fmt.Errorf("ppp secret %q has no .id", username)
	}

	// Set the profile
	_, err = c.run(ctx,
		"/ppp/secret/set",
		"=.id="+id,
		"=profile="+profile,
	)
	if err != nil {
		return fmt.Errorf("set profile for %q: %w", username, err)
	}

	return nil
}

// TestConnection verifies the RouterOS host is reachable and credentials work.
func (c *Client) TestConnection(ctx context.Context) error {
	if err := c.Connect(ctx); err != nil {
		return err
	}
	defer c.Close()

	// Try a simple /system/resource/print to confirm API works
	reply, err := c.run(ctx, "/system/resource/print")
	if err != nil {
		return fmt.Errorf("test read system resource: %w", err)
	}
	if !hasDone(reply) {
		return fmt.Errorf("unexpected response from RouterOS")
	}
	return nil
}

// login performs the RouterOS API login sequence.
func (c *Client) login(ctx context.Context) error {
	reply, err := c.run(ctx,
		"/login",
		"=name="+c.Username,
		"=password="+c.Password,
	)
	if err != nil {
		return err
	}
	// Check for !done (success) or !trap (error)
	for _, sentence := range reply {
		for _, word := range sentence {
			if strings.HasPrefix(word, "!trap") {
				return fmt.Errorf("login rejected")
			}
			if word == "!done" {
				return nil
			}
		}
	}
	return nil
}

// run sends a RouterOS API command and collects the response sentences.
func (c *Client) run(ctx context.Context, words ...string) ([][]string, error) {
	// Encode words as RouterOS API sentences
	var buf []byte
	for _, word := range words {
		buf = append(buf, encodeLength(len(word))...)
		buf = append(buf, []byte(word)...)
	}
	buf = append(buf, 0) // end sentence

	deadline := time.Now().Add(c.Timeout)
	if ctx != nil {
		if d, ok := ctx.Deadline(); ok {
			deadline = d
		}
	}
	_ = c.conn.SetDeadline(deadline)
	if _, err := c.conn.Write(buf); err != nil {
		return nil, fmt.Errorf("write api sentence: %w", err)
	}

	// Read sentences until !done or !trap
	var results [][]string
	for {
		sentence, err := readSentence(c.conn)
		if err != nil {
			return results, fmt.Errorf("read api sentence: %w", err)
		}
		results = append(results, sentence)
		for _, word := range sentence {
			if word == "!done" || strings.HasPrefix(word, "!trap") || strings.HasPrefix(word, "!fatal") {
				return results, nil
			}
		}
	}
}

func readSentence(conn net.Conn) ([]string, error) {
	var words []string
	for {
		length, err := decodeLength(conn)
		if err != nil {
			return words, err
		}
		if length == 0 {
			break
		}
		word := make([]byte, length)
		if _, err := conn.Read(word); err != nil {
			return words, err
		}
		words = append(words, string(word))
	}
	return words, nil
}

func encodeLength(n int) []byte {
	switch {
	case n < 0x80:
		return []byte{byte(n)}
	case n < 0x4000:
		n |= 0x8000
		return []byte{byte(n >> 8), byte(n)}
	case n < 0x200000:
		n |= 0xC00000
		return []byte{byte(n >> 16), byte(n >> 8), byte(n)}
	default:
		n |= 0xE0000000
		return []byte{byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)}
	}
}

func decodeLength(conn net.Conn) (int, error) {
	b := make([]byte, 1)
	if _, err := conn.Read(b); err != nil {
		return 0, err
	}
	c := int(b[0])
	switch {
	case c&0x80 == 0:
		return c, nil
	case c&0xC0 == 0x80:
		extra := make([]byte, 1)
		if _, err := conn.Read(extra); err != nil {
			return 0, err
		}
		return ((c & 0x3F) << 8) | int(extra[0]), nil
	case c&0xE0 == 0xC0:
		extra := make([]byte, 2)
		if _, err := conn.Read(extra); err != nil {
			return 0, err
		}
		return ((c & 0x1F) << 16) | (int(extra[0]) << 8) | int(extra[1]), nil
	default:
		extra := make([]byte, 3)
		if _, err := conn.Read(extra); err != nil {
			return 0, err
		}
		return ((c & 0x0F) << 24) | (int(extra[0]) << 16) | (int(extra[1]) << 8) | int(extra[2]), nil
	}
}

func extractField(sentences [][]string, field string) string {
	for _, sentence := range sentences {
		for _, word := range sentence {
			if strings.HasPrefix(word, "="+field+"=") {
				return strings.TrimPrefix(word, "="+field+"=")
			}
		}
	}
	return ""
}

func hasDone(sentences [][]string) bool {
	for _, sentence := range sentences {
		for _, word := range sentence {
			if word == "!done" {
				return true
			}
		}
	}
	return false
}

// hasError checks if the RouterOS API response sentences contain a !trap or !fatal error
// and returns it formatted as a Go error.
func hasError(sentences [][]string) error {
	for _, sentence := range sentences {
		for _, word := range sentence {
			if word == "!trap" || strings.HasPrefix(word, "!trap") {
				msg := extractField(sentences, "message")
				if msg == "" {
					msg = "command rejected by RouterOS"
				}
				return fmt.Errorf("routeros trap: %s", msg)
			}
			if word == "!fatal" || strings.HasPrefix(word, "!fatal") {
				return fmt.Errorf("routeros fatal error")
			}
		}
	}
	return nil
}

type PPPActive struct {
	Name    string
	Address string
	Uptime  string
}

// ListActiveConnections retrieves all active PPPoE connections from RouterOS /ppp/active/print.
func (c *Client) ListActiveConnections(ctx context.Context) ([]PPPActive, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("not connected to RouterOS")
	}

	reply, err := c.run(ctx, "/ppp/active/print")
	if err != nil {
		return nil, fmt.Errorf("list active ppp: %w", err)
	}
	if err := hasError(reply); err != nil {
		return nil, fmt.Errorf("list active ppp error: %w", err)
	}

	var active []PPPActive
	for _, sentence := range reply {
		hasRe := false
		for _, word := range sentence {
			if word == "!re" {
				hasRe = true
				break
			}
		}
		if !hasRe {
			continue
		}

		var a PPPActive
		for _, word := range sentence {
			if strings.HasPrefix(word, "=name=") {
				a.Name = strings.TrimPrefix(word, "=name=")
			} else if strings.HasPrefix(word, "=address=") {
				a.Address = strings.TrimPrefix(word, "=address=")
			} else if strings.HasPrefix(word, "=uptime=") {
				a.Uptime = strings.TrimPrefix(word, "=uptime=")
			}
		}
		if a.Name != "" {
			active = append(active, a)
		}
	}

	return active, nil
}

// ListSecrets retrieves all PPPoE secrets from RouterOS /ppp/secret/print.
func (c *Client) ListSecrets(ctx context.Context) ([]PPPoESecret, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("not connected to RouterOS")
	}

	reply, err := c.run(ctx, "/ppp/secret/print")
	if err != nil {
		return nil, fmt.Errorf("list ppp secrets: %w", err)
	}
	if err := hasError(reply); err != nil {
		return nil, fmt.Errorf("list ppp secrets error: %w", err)
	}

	var secrets []PPPoESecret
	for _, sentence := range reply {
		// Each !re sentence represents one secret row
		hasRe := false
		for _, word := range sentence {
			if word == "!re" {
				hasRe = true
				break
			}
		}
		if !hasRe {
			continue
		}

		var s PPPoESecret
		for _, word := range sentence {
			if strings.HasPrefix(word, "=name=") {
				s.Name = strings.TrimPrefix(word, "=name=")
			} else if strings.HasPrefix(word, "=password=") {
				s.Password = strings.TrimPrefix(word, "=password=")
			} else if strings.HasPrefix(word, "=profile=") {
				s.Profile = strings.TrimPrefix(word, "=profile=")
			} else if strings.HasPrefix(word, "=disabled=") {
				s.Disabled = strings.TrimPrefix(word, "=disabled=") == "true"
			}
		}
		if s.Name != "" {
			secrets = append(secrets, s)
		}
	}

	return secrets, nil
}

// SyncCustomer creates or updates a PPPoE secret in MikroTik, and kicks active session if status changes.
func (c *Client) SyncCustomer(ctx context.Context, username, password, profile, status string) error {
	if c.conn == nil {
		return fmt.Errorf("not connected to RouterOS")
	}

	if username == "" {
		return nil
	}

	// 1. Find the secret ID
	reply, err := c.run(ctx,
		"/ppp/secret/print",
		"?name="+username,
	)
	if err != nil {
		return fmt.Errorf("find ppp secret %q: %w", username, err)
	}
	if err := hasError(reply); err != nil {
		return fmt.Errorf("find ppp secret error for %q: %w", username, err)
	}

	id := extractField(reply, ".id")

	// Determine profile and disabled state based on status
	var targetProfile string
	var disabled string

	switch status {
	case "active":
		targetProfile = profile
		if targetProfile == "" {
			targetProfile = "default"
		}
		disabled = "no"
	case "limit":
		targetProfile = "isolir" // default isolir profile name
		disabled = "no"
	case "inactive":
		targetProfile = profile
		if targetProfile == "" {
			targetProfile = "default"
		}
		disabled = "yes"
	default:
		targetProfile = profile
		if targetProfile == "" {
			targetProfile = "default"
		}
		disabled = "no"
	}

	if id != "" {
		// Update existing secret
		setReply, err := c.run(ctx,
			"/ppp/secret/set",
			"=.id="+id,
			"=password="+password,
			"=profile="+targetProfile,
			"=disabled="+disabled,
		)
		if err != nil {
			return fmt.Errorf("update ppp secret %q: %w", username, err)
		}
		if err := hasError(setReply); err != nil {
			return fmt.Errorf("update ppp secret error for %q: %w", username, err)
		}
	} else {
		// Add new secret
		addReply, err := c.run(ctx,
			"/ppp/secret/add",
			"=name="+username,
			"=password="+password,
			"=service=pppoe",
			"=profile="+targetProfile,
			"=disabled="+disabled,
		)
		if err != nil {
			return fmt.Errorf("add ppp secret %q: %w", username, err)
		}
		if err := hasError(addReply); err != nil {
			return fmt.Errorf("add ppp secret error for %q: %w", username, err)
		}
	}

	// 2. Kick active session if one exists to apply profile/disabled changes instantly
	activeReply, err := c.run(ctx,
		"/ppp/active/print",
		"?name="+username,
	)
	if err == nil && len(activeReply) > 0 && hasError(activeReply) == nil {
		activeID := extractField(activeReply, ".id")
		if activeID != "" {
			_, _ = c.run(ctx,
				"/ppp/active/remove",
				"=.id="+activeID,
			)
		}
	}

	return nil
}

// KickUser terminates an active PPPoE session for the given username, forcing a reconnect.
func (c *Client) KickUser(ctx context.Context, username string) error {
	if c.conn == nil {
		return fmt.Errorf("not connected to RouterOS")
	}
	if username == "" {
		return fmt.Errorf("username cannot be empty")
	}

	reply, err := c.run(ctx,
		"/ppp/active/print",
		"?name="+username,
	)
	if err != nil {
		return fmt.Errorf("find active ppp %q: %w", username, err)
	}
	if err := hasError(reply); err != nil {
		return fmt.Errorf("find active ppp error for %q: %w", username, err)
	}

	id := extractField(reply, ".id")
	if id == "" {
		return fmt.Errorf("active session for %q not found", username)
	}

	removeReply, err := c.run(ctx,
		"/ppp/active/remove",
		"=.id="+id,
	)
	if err != nil {
		return fmt.Errorf("remove active ppp %q: %w", username, err)
	}
	if err := hasError(removeReply); err != nil {
		return fmt.Errorf("remove active ppp error for %q: %w", username, err)
	}

	return nil
}

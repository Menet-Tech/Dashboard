package mikrotik

import (
	"bytes"
	"context"
	"io"
	"net"
	"strings"
	"testing"
	"time"
)

// mockConn wraps reader and writer to simulate a net.Conn for unit testing helper functions.
type mockConn struct {
	net.Conn
	reader io.Reader
	writer io.Writer
}

func (m *mockConn) Read(b []byte) (int, error) {
	return m.reader.Read(b)
}

func (m *mockConn) Write(b []byte) (int, error) {
	return m.writer.Write(b)
}

func (m *mockConn) Close() error {
	return nil
}

func (m *mockConn) SetDeadline(t time.Time) error {
	return nil
}

// readSentenceFromConn read standard MikroTik RouterOS API sentences from TCP connection.
func readSentenceFromConn(conn net.Conn) ([]string, error) {
	var words []string
	for {
		length, err := decodeLengthFromConn(conn)
		if err != nil {
			return words, err
		}
		if length == 0 {
			break
		}
		word := make([]byte, length)
		_, err = io.ReadFull(conn, word)
		if err != nil {
			return words, err
		}
		words = append(words, string(word))
	}
	return words, nil
}

// decodeLengthFromConn decodes length from standard net.Conn.
func decodeLengthFromConn(conn net.Conn) (int, error) {
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

// writeSentenceToConn writes a standard RouterOS API sentence to the TCP connection.
func writeSentenceToConn(conn net.Conn, words []string) error {
	var buf []byte
	for _, word := range words {
		buf = append(buf, encodeLength(len(word))...)
		buf = append(buf, []byte(word)...)
	}
	buf = append(buf, 0)
	_, err := conn.Write(buf)
	return err
}


// mockRouterOS simulates a MikroTik RouterOS API server.
type mockRouterOS struct {
	listener net.Listener
	addr     string
	t        *testing.T
	done     chan struct{}
	handlers map[string][][]string
	onCommand func(words []string)
}

func newMockRouterOS(t *testing.T) *mockRouterOS {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start mock RouterOS server: %v", err)
	}
	return &mockRouterOS{
		listener: l,
		addr:     l.Addr().String(),
		t:        t,
		done:     make(chan struct{}),
		handlers: make(map[string][][]string),
	}
}

func (s *mockRouterOS) Start() {
	go func() {
		defer close(s.done)
		for {
			conn, err := s.listener.Accept()
			if err != nil {
				return
			}
			go s.handleConnection(conn)
		}
	}()
}

func (s *mockRouterOS) Close() {
	s.listener.Close()
	<-s.done
}

func (s *mockRouterOS) handleConnection(conn net.Conn) {
	defer conn.Close()

	// 1. Handle Login
	loginWords, err := readSentenceFromConn(conn)
	if err != nil {
		return
	}

	if len(loginWords) == 0 || loginWords[0] != "/login" {
		_ = writeSentenceToConn(conn, []string{"!trap", "=message=expected login"})
		return
	}

	var username, password string
	for _, w := range loginWords {
		if strings.HasPrefix(w, "=name=") {
			username = strings.TrimPrefix(w, "=name=")
		} else if strings.HasPrefix(w, "=password=") {
			password = strings.TrimPrefix(w, "=password=")
		}
	}

	if username == "wrong" || password == "wrong" {
		_ = writeSentenceToConn(conn, []string{"!trap", "=message=invalid credentials"})
		return
	}

	if err := writeSentenceToConn(conn, []string{"!done"}); err != nil {
		return
	}

	// 2. Command execution loop
	for {
		cmdWords, err := readSentenceFromConn(conn)
		if err != nil {
			return
		}
		if len(cmdWords) == 0 {
			continue
		}

		if s.onCommand != nil {
			s.onCommand(cmdWords)
		}

		cmd := cmdWords[0]

		// Intercept queries for unknown user to return empty result
		var nameFilter string
		for _, w := range cmdWords {
			if strings.HasPrefix(w, "?name=") {
				nameFilter = strings.TrimPrefix(w, "?name=")
			}
		}

		if (cmd == "/ppp/secret/print" || cmd == "/ppp/active/print") && nameFilter == "unknown" {
			_ = writeSentenceToConn(conn, []string{"!done"})
			continue
		}

		sentences, ok := s.handlers[cmd]
		if !ok {
			// fallback to a default !done response
			_ = writeSentenceToConn(conn, []string{"!done"})
			continue
		}

		// Filter sentences if name filter is present
		if nameFilter != "" && (cmd == "/ppp/secret/print" || cmd == "/ppp/active/print") {
			var filtered [][]string
			for _, sentence := range sentences {
				isRe := false
				matchesName := false
				for _, word := range sentence {
					if word == "!re" {
						isRe = true
					}
					if strings.HasPrefix(word, "=name=") && strings.TrimPrefix(word, "=name=") == nameFilter {
						matchesName = true
					}
				}
				if !isRe || matchesName {
					filtered = append(filtered, sentence)
				}
			}
			sentences = filtered
		}

		for _, sentence := range sentences {
			if err := writeSentenceToConn(conn, sentence); err != nil {
				return
			}
		}
	}
}

// Test length encoding/decoding covering 1, 2, 3, and 4-byte boundaries.
func TestLengthEncodingDecoding(t *testing.T) {
	testLengths := []int{
		5,       // < 0x80 (1 byte)
		150,     // < 0x4000 (2 bytes)
		20000,   // < 0x200000 (3 bytes)
		3000000, // >= 0x200000 (4 bytes)
	}
	for _, l := range testLengths {
		encoded := encodeLength(l)
		mc := &mockConn{
			reader: bytes.NewReader(encoded),
		}
		decoded, err := decodeLength(mc)
		if err != nil {
			t.Fatalf("failed to decode length %d: %v", l, err)
		}
		if decoded != l {
			t.Errorf("length mismatch for %d: got %d", l, decoded)
		}
	}
}

// Test helper extractField and hasDone function logic.
func TestFieldHelpers(t *testing.T) {
	sentences := [][]string{
		{"!re", "=.id=*1", "=name=cust1"},
		{"!done"},
	}
	if extractField(sentences, ".id") != "*1" {
		t.Errorf("failed to extract id")
	}
	if extractField(sentences, "name") != "cust1" {
		t.Errorf("failed to extract name")
	}
	if extractField(sentences, "missing") != "" {
		t.Errorf("expected empty string for missing field")
	}
	if !hasDone(sentences) {
		t.Errorf("expected hasDone to be true")
	}

	errSentences := [][]string{
		{"!trap", "=message=some error"},
	}
	err := hasError(errSentences)
	if err == nil || !strings.Contains(err.Error(), "some error") {
		t.Errorf("expected error containing 'some error', got: %v", err)
	}

	fatalSentences := [][]string{
		{"!fatal"},
	}
	if hasError(fatalSentences) == nil {
		t.Errorf("expected fatal error")
	}

	emptySentences := [][]string{
		{"!re"},
	}
	if hasError(emptySentences) != nil {
		t.Errorf("expected nil error for plain records")
	}
}

// Test client connections, connection testing, and close behavior.
func TestClientConnectionAndTesting(t *testing.T) {
	s := newMockRouterOS(t)
	s.handlers["/system/resource/print"] = [][]string{
		{"!re", "=uptime=12d3h"},
		{"!done"},
	}
	s.Start()
	defer s.Close()

	ctx := context.Background()

	// 1. Success Connection
	c := NewClient(s.addr, "admin", "admin")
	err := c.Connect(ctx)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	c.Close()

	// 2. Test Connection
	c2 := NewClient(s.addr, "admin", "admin")
	err = c2.TestConnection(ctx)
	if err != nil {
		t.Errorf("failed TestConnection: %v", err)
	}

	// 3. Failed Login
	c3 := NewClient(s.addr, "wrong", "wrong")
	err = c3.Connect(ctx)
	if err == nil {
		t.Errorf("expected error due to wrong credentials, got nil")
	}

	// 4. Closed connection client calls
	c4 := NewClient(s.addr, "admin", "admin")
	if err := c4.LimitUser(ctx, "test", "profile"); err == nil {
		t.Errorf("expected error for un-connected client")
	}
	if _, err := c4.ListActiveConnections(ctx); err == nil {
		t.Errorf("expected error for un-connected client")
	}
	if _, err := c4.ListSecrets(ctx); err == nil {
		t.Errorf("expected error for un-connected client")
	}
	if _, err := c4.ListProfiles(ctx); err == nil {
		t.Errorf("expected error for un-connected client")
	}
	if err := c4.KickUser(ctx, "user"); err == nil {
		t.Errorf("expected error for un-connected client")
	}
}

// Test list operations: secrets, profiles, active connections.
func TestListOperations(t *testing.T) {
	s := newMockRouterOS(t)
	s.handlers["/ppp/secret/print"] = [][]string{
		{"!re", "=name=user1", "=password=pass1", "=profile=default", "=disabled=false"},
		{"!re", "=name=user2", "=password=pass2", "=profile=isolir", "=disabled=true"},
		{"!done"},
	}
	s.handlers["/ppp/active/print"] = [][]string{
		{"!re", "=name=user1", "=address=192.168.1.10", "=uptime=05:12:00"},
		{"!done"},
	}
	s.handlers["/ppp/profile/print"] = [][]string{
		{"!re", "=name=default", "=local-address=192.168.1.1", "=remote-address=pool1", "=rate-limit=10M/10M"},
		{"!done"},
	}
	s.Start()
	defer s.Close()

	ctx := context.Background()
	c := NewClient(s.addr, "admin", "admin")
	if err := c.Connect(ctx); err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	// 1. Secrets
	secrets, err := c.ListSecrets(ctx)
	if err != nil {
		t.Fatalf("ListSecrets: %v", err)
	}
	if len(secrets) != 2 {
		t.Errorf("expected 2 secrets, got %d", len(secrets))
	}
	if secrets[0].Name != "user1" || secrets[1].Profile != "isolir" || !secrets[1].Disabled {
		t.Errorf("secrets parsing mismatch: %+v", secrets)
	}

	// 2. Active Connections
	actives, err := c.ListActiveConnections(ctx)
	if err != nil {
		t.Fatalf("ListActiveConnections: %v", err)
	}
	if len(actives) != 1 {
		t.Errorf("expected 1 active connection, got %d", len(actives))
	}
	if actives[0].Name != "user1" || actives[0].Address != "192.168.1.10" || actives[0].Uptime != "05:12:00" {
		t.Errorf("active parsing mismatch: %+v", actives)
	}

	// 3. Profiles
	profiles, err := c.ListProfiles(ctx)
	if err != nil {
		t.Fatalf("ListProfiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Errorf("expected 1 profile, got %d", len(profiles))
	}
	if profiles[0].Name != "default" || profiles[0].LocalAddress != "192.168.1.1" || profiles[0].RemoteAddress != "pool1" || profiles[0].RateLimit != "10M/10M" {
		t.Errorf("profile parsing mismatch: %+v", profiles)
	}
}

// Test user limiting and session kicking.
func TestLimitAndKickUser(t *testing.T) {
	s := newMockRouterOS(t)
	s.handlers["/ppp/secret/print"] = [][]string{
		{"!re", "=.id=*1", "=name=user1"},
		{"!done"},
	}
	s.handlers["/ppp/secret/set"] = [][]string{
		{"!done"},
	}
	s.handlers["/ppp/active/print"] = [][]string{
		{"!re", "=.id=*A1", "=name=user1"},
		{"!done"},
	}
	s.handlers["/ppp/active/remove"] = [][]string{
		{"!done"},
	}
	s.Start()
	defer s.Close()

	ctx := context.Background()
	c := NewClient(s.addr, "admin", "admin")
	if err := c.Connect(ctx); err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	// 1. Limit User
	err := c.LimitUser(ctx, "user1", "isolir")
	if err != nil {
		t.Errorf("LimitUser failed: %v", err)
	}

	// 2. Limit User Not Found
	err = c.LimitUser(ctx, "unknown", "isolir")
	if err == nil {
		t.Errorf("expected error limiting unknown user, got nil")
	}

	// 3. Kick User
	err = c.KickUser(ctx, "user1")
	if err != nil {
		t.Errorf("KickUser failed: %v", err)
	}

	// 4. Kick User Not Found
	err = c.KickUser(ctx, "unknown")
	if err == nil {
		t.Errorf("expected error kicking unknown user, got nil")
	}
}

// Test SyncCustomer with various statuses.
func TestSyncCustomer(t *testing.T) {
	s := newMockRouterOS(t)
	// We dynamically register endpoints so we mock a typical sync cycle:
	// For existing secret: /ppp/secret/print -> returns id -> /ppp/secret/set -> /ppp/active/print -> /ppp/active/remove
	s.handlers["/ppp/secret/print"] = [][]string{
		{"!re", "=.id=*1", "=name=user1"},
		{"!done"},
	}
	s.handlers["/ppp/secret/set"] = [][]string{
		{"!done"},
	}
	s.handlers["/ppp/active/print"] = [][]string{
		{"!re", "=.id=*A1", "=name=user1"},
		{"!done"},
	}
	s.handlers["/ppp/active/remove"] = [][]string{
		{"!done"},
	}
	s.Start()
	defer s.Close()

	ctx := context.Background()
	c := NewClient(s.addr, "admin", "admin")
	if err := c.Connect(ctx); err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	// Test case: Username empty (should skip silently)
	if err := c.SyncCustomer(ctx, "", "pass", "profile", "active"); err != nil {
		t.Errorf("expected empty username sync to pass silently, got: %v", err)
	}

	// Test case: Sync active status
	err := c.SyncCustomer(ctx, "user1", "pass1", "package10m", "active")
	if err != nil {
		t.Errorf("Sync active customer failed: %v", err)
	}

	// Test case: Sync limit status
	err = c.SyncCustomer(ctx, "user1", "pass1", "package10m", "limit")
	if err != nil {
		t.Errorf("Sync limit customer failed: %v", err)
	}

	// Test case: Sync inactive status
	err = c.SyncCustomer(ctx, "user1", "pass1", "package10m", "inactive")
	if err != nil {
		t.Errorf("Sync inactive customer failed: %v", err)
	}

	// Test case: Sync other custom status
	err = c.SyncCustomer(ctx, "user1", "pass1", "package10m", "custom_status")
	if err != nil {
		t.Errorf("Sync custom status customer failed: %v", err)
	}
}

// Test SyncCustomer add new secret scenario.
func TestSyncCustomerAddNewSecret(t *testing.T) {
	s := newMockRouterOS(t)
	// /ppp/secret/print -> returns !done without re (meaning not found)
	// /ppp/secret/add -> !done
	// /ppp/active/print -> !done without re
	s.handlers["/ppp/secret/print"] = [][]string{
		{"!done"},
	}
	s.handlers["/ppp/secret/add"] = [][]string{
		{"!done"},
	}
	s.handlers["/ppp/active/print"] = [][]string{
		{"!done"},
	}
	s.Start()
	defer s.Close()

	ctx := context.Background()
	c := NewClient(s.addr, "admin", "admin")
	if err := c.Connect(ctx); err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	err := c.SyncCustomer(ctx, "new_user", "pass", "profile", "active")
	if err != nil {
		t.Errorf("Sync addNewSecret failed: %v", err)
	}
}

// Test connection timeout and network read/write failures.
func TestConnectionFailureAndTimeouts(t *testing.T) {
	// Use an un-routable address to force network failure or timeout
	c := NewClient("192.0.2.1:8728", "admin", "admin")
	c.Timeout = 50 * time.Millisecond // make timeout short
	
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	
	err := c.Connect(ctx)
	if err == nil {
		t.Errorf("expected connection error or timeout, got nil")
	}
}

// Test decodeLength validation errors.
func TestDecodeLengthError(t *testing.T) {
	// 1. Connection error (EOF)
	mc := &mockConn{
		reader: bytes.NewReader([]byte{}),
	}
	_, err := decodeLength(mc)
	if err == nil {
		t.Errorf("expected error from EOF read")
	}

	// 2. Connection error on 2nd byte read
	mc2 := &mockConn{
		reader: bytes.NewReader([]byte{0x80}), // needs 1 extra byte
	}
	_, err = decodeLength(mc2)
	if err == nil {
		t.Errorf("expected error from incomplete read")
	}

	// 3. Connection error on 3rd byte read
	mc3 := &mockConn{
		reader: bytes.NewReader([]byte{0xC0, 0x01}), // needs 2 extra bytes
	}
	_, err = decodeLength(mc3)
	if err == nil {
		t.Errorf("expected error from incomplete read")
	}

	// 4. Connection error on 4th byte read
	mc4 := &mockConn{
		reader: bytes.NewReader([]byte{0xE0, 0x01, 0x02}), // needs 3 extra bytes
	}
	_, err = decodeLength(mc4)
	if err == nil {
		t.Errorf("expected error from incomplete read")
	}
}

// Test run command error scenarios.
func TestClientRunErrors(t *testing.T) {
	s := newMockRouterOS(t)
	// Force a trap response for a specific print command to mock API-level failure
	s.handlers["/ppp/secret/print"] = [][]string{
		{"!trap", "=message=permission denied"},
	}
	s.Start()
	defer s.Close()

	ctx := context.Background()
	c := NewClient(s.addr, "admin", "admin")
	if err := c.Connect(ctx); err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	_, err := c.ListSecrets(ctx)
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected 'permission denied' error, got: %v", err)
	}
}

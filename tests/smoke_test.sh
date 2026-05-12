#!/usr/bin/env bash
# smoke_test.sh — Quick production smoke test for Menet-Tech ISP Billing
# Usage: BASE_URL=http://localhost:8080 ADMIN_PASS=secret bash tests/smoke_test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-password}"
COOKIE_FILE=$(mktemp)

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo "=== Menet-Tech Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# 1. Health check
echo "--- 1. Health Check ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health")
[ "$STATUS" = "200" ] && pass "Health endpoint returns 200" || fail "Health returned $STATUS"

# 2. Login
echo ""
echo "--- 2. Authentication ---"
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_FILE" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
CSRF=$(echo "$LOGIN_RESP" | grep -o '"csrf_token":"[^"]*"' | cut -d'"' -f4)
[ -n "$CSRF" ] && pass "Login succeeded, got CSRF token" || fail "Login failed: $LOGIN_RESP"

# 3. Authenticated /me
echo ""
echo "--- 3. Session /me ---"
ME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/auth/me" \
  -b "$COOKIE_FILE" -H "X-CSRF-Token: $CSRF")
[ "$ME_STATUS" = "200" ] && pass "/auth/me returns 200" || fail "/auth/me returned $ME_STATUS"

# 4. Dashboard summary
echo ""
echo "--- 4. Dashboard Summary ---"
DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/dashboard/summary" \
  -b "$COOKIE_FILE" -H "X-CSRF-Token: $CSRF")
[ "$DASH_STATUS" = "200" ] && pass "/dashboard/summary returns 200" || fail "/dashboard/summary returned $DASH_STATUS"

# 5. Packages list
echo ""
echo "--- 5. Packages ---"
PKG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/packages" \
  -b "$COOKIE_FILE" -H "X-CSRF-Token: $CSRF")
[ "$PKG_STATUS" = "200" ] && pass "/packages returns 200" || fail "/packages returned $PKG_STATUS"

# 6. Customers list
echo ""
echo "--- 6. Customers ---"
CUST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/customers" \
  -b "$COOKIE_FILE" -H "X-CSRF-Token: $CSRF")
[ "$CUST_STATUS" = "200" ] && pass "/customers returns 200" || fail "/customers returned $CUST_STATUS"

# 7. Bills list
echo ""
echo "--- 7. Bills ---"
BILLS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/bills" \
  -b "$COOKIE_FILE" -H "X-CSRF-Token: $CSRF")
[ "$BILLS_STATUS" = "200" ] && pass "/bills returns 200" || fail "/bills returned $BILLS_STATUS"

# 8. Backups list (admin)
echo ""
echo "--- 8. Backups ---"
BACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/backups" \
  -b "$COOKIE_FILE" -H "X-CSRF-Token: $CSRF")
[ "$BACK_STATUS" = "200" ] && pass "/backups returns 200" || fail "/backups returned $BACK_STATUS"

# 9. Static frontend served
echo ""
echo "--- 9. Static Frontend ---"
FRONT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
[ "$FRONT_STATUS" = "200" ] && pass "Frontend root returns 200" || fail "Frontend root returned $FRONT_STATUS"

# 10. Logout
echo ""
echo "--- 10. Logout ---"
LOGOUT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/auth/logout" \
  -b "$COOKIE_FILE" -H "X-CSRF-Token: $CSRF")
[ "$LOGOUT_STATUS" = "200" ] && pass "Logout returns 200" || fail "Logout returned $LOGOUT_STATUS"

rm -f "$COOKIE_FILE"

echo ""
echo "==================================="
echo -e "${GREEN}All smoke tests passed!${NC}"

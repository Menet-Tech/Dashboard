package auth

import "context"

type contextKey string

const userContextKey contextKey = "authenticated-user"
const sessionTokenContextKey contextKey = "authenticated-session-token"
const csrfTokenContextKey contextKey = "authenticated-csrf-token"

func WithUser(ctx context.Context, user User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey).(User)
	return user, ok
}

func WithSessionToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, sessionTokenContextKey, token)
}

func SessionTokenFromContext(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(sessionTokenContextKey).(string)
	return token, ok
}

func WithCSRFToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, csrfTokenContextKey, token)
}

func CSRFTokenFromContext(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(csrfTokenContextKey).(string)
	return token, ok
}

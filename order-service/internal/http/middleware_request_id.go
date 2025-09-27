package http

import (
	"context"
	"fmt"
	"net/http"
	"time"
)


type ctxKey string

const ctxRequestID ctxKey = "requestID"

func WithRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rid := r.Header.Get("X-Request-ID")
		if rid == "" {
		
			rid = fmt.Sprintf("%d", time.Now().UnixNano())
		}
		w.Header().Set("X-Request-ID", rid)

		ctx := context.WithValue(r.Context(), ctxRequestID, rid)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func RequestIDFromContext(ctx context.Context) string {
	if v := ctx.Value(ctxRequestID); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
		
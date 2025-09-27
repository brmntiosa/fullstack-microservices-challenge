package http

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// gunakan key bertipe khusus agar aman dipakai di context
type ctxKey string

const ctxRequestID ctxKey = "requestID"

// WithRequestID menyalin X-Request-ID dari header request ke response,
// atau membuat yang baru jika tidak ada. Nilai juga disimpan di context.
func WithRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rid := r.Header.Get("X-Request-ID")
		if rid == "" {
			// ID sederhana yang monoton dan cepat (cukup untuk tracing)
			rid = fmt.Sprintf("%d", time.Now().UnixNano())
		}
		w.Header().Set("X-Request-ID", rid)

		ctx := context.WithValue(r.Context(), ctxRequestID, rid)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// (opsional) helper untuk ambil Request ID dari context
func RequestIDFromContext(ctx context.Context) string {
	if v := ctx.Value(ctxRequestID); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

package http

import (
	"log"
	"net/http"
)

func WithRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[panic] %v", rec)

				writeErr(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

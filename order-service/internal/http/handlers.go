package http

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/streadway/amqp"

	"order-service/internal/repo"
)

// ===== cache entry =====
type productCacheEntry struct {
	price     float64
	expiresAt time.Time
}

// ===== error envelope & helpers =====
type apiError struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}
type apiErrorEnvelope struct {
	Error apiError `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeErr(w http.ResponseWriter, status int, code, msg string, details ...interface{}) {
	var d interface{}
	if len(details) > 0 {
		d = details[0]
	}
	writeJSON(w, status, apiErrorEnvelope{
		Error: apiError{Code: code, Message: msg, Details: d},
	})
}

// ===== mux =====
type Mux struct {
	mux         *http.ServeMux
	repo        repo.Store
	rdb         *redis.Client
	amqpCh      *amqp.Channel
	productBase string

	// reusable HTTP client (transport sudah di-tune di main.go)
	httpClient *http.Client

	// in-memory cache + flag SWR
	mu           sync.RWMutex
	productCache map[int]productCacheEntry
	refreshing   map[int]bool
}

func NewMux(r repo.Store, rdb *redis.Client, ch *amqp.Channel, productBase string) *http.ServeMux {
	h := &Mux{
		mux:          http.NewServeMux(),
		repo:         r,
		rdb:          rdb,
		amqpCh:       ch,
		productBase:  productBase,
		httpClient:   http.DefaultClient,
		productCache: make(map[int]productCacheEntry),
		refreshing:   make(map[int]bool),
	}
	h.routes()
	return h.mux
}

func (h *Mux) routes() {
	h.mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "order-service up"})
	})
	h.mux.HandleFunc("/orders", h.createOrder)                 // POST
	h.mux.HandleFunc("/orders/product/", h.getOrdersByProduct) // GET /orders/product/{id}
}

// ===== types =====
type createOrderReq struct {
	ProductID int `json:"productId"`
	Qty       int `json:"qty"`
}

type productResp struct {
	ID    int     `json:"id"`
	Price float64 `json:"price"`
}

// ===== handlers =====

// POST /orders
func (h *Mux) createOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "only POST is allowed")
		return
	}
	ct := r.Header.Get("Content-Type")
	if !strings.HasPrefix(strings.ToLower(ct), "application/json") {
		writeErr(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json")
		return
	}

	// Limit body & strict JSON
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB
	defer r.Body.Close()
	var req createOrderReq
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "BAD_JSON", "invalid JSON body", err.Error())
		return
	}
	if req.ProductID <= 0 || req.Qty <= 0 {
		writeErr(w, http.StatusBadRequest, "BAD_REQUEST", "invalid productId/qty (must be > 0)")
		return
	}

	// === 1) VALIDASI PRODUK: cache 25–35s + SWR ===
	now := time.Now()

	h.mu.RLock()
	ce, ok := h.productCache[req.ProductID]
	isRefreshing := h.refreshing[req.ProductID]
	h.mu.RUnlock()

	var prod productResp

	switch {
	case ok && now.Before(ce.expiresAt):
		// HIT
		prod = productResp{ID: req.ProductID, Price: ce.price}

	case ok && now.After(ce.expiresAt):
		// EXPIRED → serve stale, revalidate di background (satu goroutine saja)
		prod = productResp{ID: req.ProductID, Price: ce.price}

		if !isRefreshing {
			h.mu.Lock()
			if !h.refreshing[req.ProductID] {
				h.refreshing[req.ProductID] = true
				go h.refreshPrice(req.ProductID) // background refresh
			}
			h.mu.Unlock()
		}

	default:
		// COLD MISS → sinkron call ke product-service
		ctx, cancel := context.WithTimeout(r.Context(), 2500*time.Millisecond)
		defer cancel()

		url := fmt.Sprintf("%s/products/%d", h.productBase, req.ProductID)
		httpReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		httpReq.Header.Set("Accept", "application/json")

		resp, err := h.httpClient.Do(httpReq)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "PRODUCT_NOT_FOUND", "unable to validate product")
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			writeErr(w, http.StatusBadRequest, "PRODUCT_NOT_FOUND", "product not found")
			return
		}

		if err := json.NewDecoder(resp.Body).Decode(&prod); err != nil || prod.ID == 0 {
			writeErr(w, http.StatusBadRequest, "PRODUCT_INVALID", "invalid product response")
			return
		}

		ttl := 25*time.Second + time.Duration(rand.Intn(10))*time.Second // 25–35s
		h.mu.Lock()
		h.productCache[req.ProductID] = productCacheEntry{
			price:     prod.Price,
			expiresAt: now.Add(ttl),
		}
		h.mu.Unlock()
	}

	// === 2) hitung total & insert DB ===
	total := float64(req.Qty) * prod.Price
	id, err := h.repo.InsertOrder(&repo.Order{
		ProductID:  req.ProductID,
		Qty:        req.Qty,
		TotalPrice: total,
		Status:     "CREATED",
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "DB_ERROR", "failed to insert order")
		return
	}

	// === 3) publish event order.created (best-effort) ===
	evt := map[string]any{
		"orderId":    id,
		"productId":  req.ProductID,
		"qty":        req.Qty,
		"totalPrice": total,
		"createdAt":  time.Now().UTC().Format(time.RFC3339),
	}
	b, _ := json.Marshal(evt)
	if pubErr := h.amqpCh.Publish("orders", "order.created", false, false, amqp.Publishing{
		ContentType: "application/json",
		Body:        b,
	}); pubErr != nil {
		log.Printf("[warn] publish order.created failed: %v", pubErr)
	}

	// === 4) invalidate cache Redis untuk daftar orders per product ===
	_ = h.rdb.Del(context.Background(), fmt.Sprintf("orders:product:%d", req.ProductID)).Err()

	// === 5) response ===
	writeJSON(w, http.StatusCreated, evt)
}

// GET /orders/product/{id}
func (h *Mux) getOrdersByProduct(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "only GET is allowed")
		return
	}
	p := r.URL.Path[len("/orders/product/"):]
	pid, _ := strconv.Atoi(p)
	if pid <= 0 {
		writeErr(w, http.StatusBadRequest, "BAD_REQUEST", "bad productId")
		return
	}

	ctx := context.Background()
	key := fmt.Sprintf("orders:product:%d", pid)

	// cache first (Redis)
	if s, err := h.rdb.Get(ctx, key).Result(); err == nil && s != "" {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(s))
		return
	}

	ords, err := h.repo.OrdersByProduct(pid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "DB_ERROR", "failed to query orders")
		return
	}
	if ords == nil {
		ords = []repo.Order{} // pastikan [] bukan null
	}
	b, _ := json.Marshal(ords)
	_ = h.rdb.Set(ctx, key, b, time.Minute).Err()

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(b)
}

// ===== background refresh (SWR) =====
func (h *Mux) refreshPrice(pid int) {
	defer func() {
		h.mu.Lock()
		h.refreshing[pid] = false
		h.mu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()

	url := fmt.Sprintf("%s/products/%d", h.productBase, pid)
	httpReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	httpReq.Header.Set("Accept", "application/json")

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		return // biarkan stale tetap dipakai sampai refresh berikutnya
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return
	}

	var p productResp
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil || p.ID == 0 {
		return
	}

	ttl := 25*time.Second + time.Duration(rand.Intn(10))*time.Second
	h.mu.Lock()
	h.productCache[pid] = productCacheEntry{
		price:     p.Price,
		expiresAt: time.Now().Add(ttl),
	}
	h.mu.Unlock()
}

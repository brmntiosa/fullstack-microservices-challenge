package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/streadway/amqp"

	"order-service/internal/repo"
)

type fakeRepo struct {
	calls int
	data  []repo.Order
}

func (f *fakeRepo) InsertOrder(o *repo.Order) (int64, error) { return 0, nil }
func (f *fakeRepo) OrdersByProduct(pid int) ([]repo.Order, error) {
	f.calls++
	return f.data, nil
}

func Test_GetOrdersByProduct_CacheMissThenHit(t *testing.T) {
	// miniredis (in-memory)
	mr := miniredis.RunT(t)
	defer mr.Close()
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})

	// fake data: CreatedAt bertipe string → pakai RFC3339
	f := &fakeRepo{
		data: []repo.Order{
			{
				ID:         1,
				ProductID:  42,
				Qty:        2,
				TotalPrice: 1000,
				Status:     "CREATED",
				CreatedAt:  time.Now().UTC().Format(time.RFC3339),
			},
		},
	}

	// buat mux dengan repo fake; amqp tidak dipakai di handler ini boleh nil
	mux := NewMux(f, rdb, (*amqp.Channel)(nil), "")

	// 1) MISS: tidak ada key di redis → panggil repo sekali → set cache
	req1 := httptest.NewRequest(http.MethodGet, "/orders/product/42", nil)
	rec1 := httptest.NewRecorder()
	mux.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec1.Code)
	}
	if f.calls != 1 {
		t.Fatalf("repo should be called once on miss, got %d", f.calls)
	}

	// 2) HIT: ada key → tidak panggil repo lagi
	req2 := httptest.NewRequest(http.MethodGet, "/orders/product/42", nil)
	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec2.Code)
	}
	if f.calls != 1 {
		t.Fatalf("repo should NOT be called on hit, got %d", f.calls)
	}

	// (opsional) assert payload
	var got []repo.Order
	_ = json.Unmarshal(rec2.Body.Bytes(), &got)
	if len(got) != 1 || got[0].ProductID != 42 {
		t.Fatalf("unexpected body: %s", rec2.Body.String())
	}

	// (opsional) cek TTL terset
	key := "orders:product:" + strconv.Itoa(42)
	if ttl := mr.TTL(key); ttl <= 0 {
		t.Fatalf("expected key TTL > 0, got %v", ttl)
	}
}

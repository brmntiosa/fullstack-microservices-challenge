package main

import (
	"context"
	"encoding/json"
	"log"
	stdhttp "net/http" 
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"
	"github.com/streadway/amqp"

	api "order-service/internal/http"
	"order-service/internal/repo"
)

type OrderCreated struct {
	OrderID    int     `json:"orderId"`
	ProductID  int     `json:"productId"`
	Qty        int     `json:"qty"`
	TotalPrice float64 `json:"totalPrice"`
	CreatedAt  string  `json:"createdAt"`
}

func main() {
	port := env("PORT", "4000")
	mysqlDSN := env("MYSQL_DSN",
  "app:app@tcp(mysql:3306)/appdb?parseTime=true&loc=UTC&timeout=5s&interpolateParams=true&readTimeout=2s&writeTimeout=2s")
	redisURL := env("REDIS_URL", "redis://redis:6379")
	rabbitURL := env("RABBIT_URL", "amqp://guest:guest@rabbitmq:5672")
	productBase := env("PRODUCT_BASE_URL", "http://product-service:3000")
	amqpExchange := env("AMQP_EXCHANGE", "orders")
	amqpRoutingKey := env("AMQP_ROUTING_KEY_ORDER_CREATED", "order.created")
	amqpQueue := env("AMQP_QUEUE_ORDER_CREATED", "order-service__logger")
	amqpConsumerTag := env("AMQP_CONSUMER_TAG", "order-service-logger")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := sqlx.Open("mysql", mysqlDSN)
	must(err)

	db.SetMaxOpenConns(200)
	db.SetMaxIdleConns(100)
	db.SetConnMaxLifetime(2 * time.Minute)
	must(db.Ping())
	
	const schema = `
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  qty INT NOT NULL,
  totalPrice DOUBLE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`

	_, err = db.Exec(schema)
	must(err)
	opt, err := redis.ParseURL(redisURL)
	must(err)
	rdb := redis.NewClient(opt)
	conn, err := amqp.Dial(rabbitURL)
	must(err)
	chPub, err := conn.Channel() 
	must(err)
	must(chPub.ExchangeDeclare(amqpExchange, "topic", true, false, false, false, nil))
	chCons, err := conn.Channel()
	must(err)

	_ = chCons.Qos(200, 0, false) 
	q, err := chCons.QueueDeclare(
		amqpQueue,
		true,  
		false, 
		false, 
		false, 
		nil,
	)

	must(err)
	must(chCons.QueueBind(q.Name, amqpRoutingKey, amqpExchange, false, nil))

	msgs, err := chCons.Consume(
		q.Name,
		amqpConsumerTag,
		false, 
		false,
		false,
		false,
		nil,
	)
	must(err)

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case d, ok := <-msgs:
				if !ok {
					return
				}
				handleDelivery(d)
			}
		}
	}()

	if t, ok := stdhttp.DefaultTransport.(*stdhttp.Transport); ok {
		t.MaxIdleConns = 10000
		t.MaxIdleConnsPerHost = 10000
		t.MaxConnsPerHost = 0           
		t.IdleConnTimeout = 90 * time.Second
		t.ForceAttemptHTTP2 = false      
	}
	stdhttp.DefaultClient.Timeout = 3 * time.Second
	repositories := repo.NewRepo(db)
	mux := api.NewMux(repositories, rdb, chPub, productBase)
	srv := &stdhttp.Server{
		Addr: ":" + port,
		Handler: api.WithRequestID(api.WithRecover(mux)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	  go func() {
		log.Printf("order-service listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != stdhttp.ErrServerClosed {
		  log.Fatalf("[fatal] http server: %v", err)
		}
	  }()

	<-ctx.Done()
	log.Println("order-service shutting down...")
	shCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shCtx)
	_ = chCons.Cancel(amqpConsumerTag, false)
	_ = chCons.Close()
	_ = chPub.Close()
	_ = conn.Close()
	_ = db.Close()
	_ = rdb.Close()
}


func handleDelivery(d amqp.Delivery) {
	if len(d.Body) == 0 {
		_ = d.Ack(false)
		return
	}

	var ev OrderCreated
	if err := json.Unmarshal(d.Body, &ev); err != nil {
		log.Printf("[order-service] invalid JSON for order.created: %v | raw=%q", err, string(d.Body))
		_ = d.Nack(false, true) 
		return
	}

	if ev.ProductID <= 0 || ev.Qty <= 0 {
		log.Printf("[order-service] invalid numeric payload: %+v", ev)
		_ = d.Ack(false) 
		return
	}

	log.Printf("[order-service] order.created received: %+v", ev)
	_ = d.Ack(false)
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

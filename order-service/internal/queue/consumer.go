package queue

import (
	"context"
	"encoding/json"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

type OrderCreated struct {
	OrderID    int     `json:"orderId"`
	ProductID  int     `json:"productId"`
	Qty        int     `json:"qty"`
	TotalPrice float64 `json:"totalPrice"`
	CreatedAt  string  `json:"createdAt"`
}

// ConsumeOrderCreated sets up the consumer and starts a goroutine to handle deliveries.
// Logs each order.created payload. Returns a stop function to cancel the consumer.
func ConsumeOrderCreated(
	ctx context.Context,
	ch *amqp.Channel,
	exchange string,       // e.g. "orders"
	queueName string,      // e.g. "order-service.order-created"
	routingKey string,     // e.g. "order.created"
	consumerTag string,    // e.g. "order-service-listener"
) (func() error, error) {
	// Declare a topic exchange for flexibility (matches NestJS pattern).
	if err := ch.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err != nil {
		return nil, err
	}

	q, err := ch.QueueDeclare(
		queueName,
		true,  // durable
		false, // autoDelete
		false, // exclusive
		false, // noWait
		nil,
	)
	if err != nil {
		return nil, err
	}

	if err := ch.QueueBind(q.Name, routingKey, exchange, false, nil); err != nil {
		return nil, err
	}

	// Keep a sane prefetch to avoid flooding
	if err := ch.Qos(100, 0, false); err != nil {
		return nil, err
	}

	msgs, err := ch.Consume(
		q.Name,
		consumerTag,
		false, // autoAck=false → we control ack/nack
		false, // exclusive
		false, // noLocal (RabbitMQ ignores this)
		false, // noWait
		nil,
	)
	if err != nil {
		return nil, err
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case m, ok := <-msgs:
				if !ok {
					return
				}
				handleDelivery(m)
			}
		}
	}()

	stop := func() error {
		// Cancels just this consumer; channel/conn can be closed elsewhere.
		return ch.Cancel(consumerTag, false)
	}
	return stop, nil
}

func handleDelivery(m amqp.Delivery) {
	// Guard: empty body → ack & return
	if len(m.Body) == 0 {
		_ = m.Ack(false)
		return
	}

	var ev OrderCreated
	if err := json.Unmarshal(m.Body, &ev); err != nil {
		log.Printf("[order-service] invalid JSON for order.created: %v | raw=%q", err, string(m.Body))
		_ = m.Nack(false, true) // requeue
		return
	}

	// Validate essential numeric fields (mirror of TS guard path)
	if ev.ProductID <= 0 || ev.Qty <= 0 {
		log.Printf("[order-service] invalid numeric payload: %+v", ev)
		_ = m.Ack(false) // treat as processed; no retry
		return
	}

	// Happy path: just log (as required by the test spec)
	log.Printf("[order-service] order.created received: %+v", ev)

	_ = m.Ack(false)
}

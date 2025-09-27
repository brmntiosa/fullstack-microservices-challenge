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

func ConsumeOrderCreated(
	ctx context.Context,
	ch *amqp.Channel,
	exchange string,       
	queueName string,     
	routingKey string,     
	consumerTag string,   
) (func() error, error) {
	if err := ch.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err != nil {
		return nil, err
	}

	q, err := ch.QueueDeclare(
		queueName,
		true,  
		false, 
		false, 
		false, 
		nil,
	)
	if err != nil {
		return nil, err
	}

	if err := ch.QueueBind(q.Name, routingKey, exchange, false, nil); err != nil {
		return nil, err
	}

	if err := ch.Qos(100, 0, false); err != nil {
		return nil, err
	}

	msgs, err := ch.Consume(
		q.Name,
		consumerTag,
		false, 
		false, 
		false, 
		false, 
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
		return ch.Cancel(consumerTag, false)
	}
	return stop, nil
}

func handleDelivery(m amqp.Delivery) {
	if len(m.Body) == 0 {
		_ = m.Ack(false)
		return
	}

	var ev OrderCreated
	if err := json.Unmarshal(m.Body, &ev); err != nil {
		log.Printf("[order-service] invalid JSON for order.created: %v | raw=%q", err, string(m.Body))
		_ = m.Nack(false, true) 
		return
	}

	if ev.ProductID <= 0 || ev.Qty <= 0 {
		log.Printf("[order-service] invalid numeric payload: %+v", ev)
		_ = m.Ack(false) 
		return
	}

	log.Printf("[order-service] order.created received: %+v", ev)

	_ = m.Ack(false)
}

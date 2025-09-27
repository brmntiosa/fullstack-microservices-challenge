package repo

import (
	"context"

	"github.com/jmoiron/sqlx"
)

type Repo struct {
	DB         *sqlx.DB
	insertStmt *sqlx.Stmt
}

func NewRepo(db *sqlx.DB) *Repo {
	stmt, err := db.Preparex(`
		INSERT INTO orders (productId, qty, totalPrice, status)
		VALUES (?, ?, ?, ?)
	`)
	if err != nil {
		panic(err)
	}
	return &Repo{DB: db, insertStmt: stmt}
}

type Order struct {
	ID         int64   `db:"id"         json:"id"`
	ProductID  int     `db:"productId"  json:"productId"`
	Qty        int     `db:"qty"        json:"qty"`
	TotalPrice float64 `db:"totalPrice" json:"totalPrice"`
	Status     string  `db:"status"     json:"status"`
	CreatedAt  string  `db:"createdAt"  json:"createdAt"`
}

func (r *Repo) InsertOrder(o *Order) (int64, error) {
	res, err := r.insertStmt.ExecContext(
		context.Background(),
		o.ProductID, o.Qty, o.TotalPrice, o.Status,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) OrdersByProduct(productID int) ([]Order, error) {
    var out []Order
    err := r.DB.Select(&out, `
        SELECT id, productId, qty, totalPrice, status, createdAt
        FROM orders
        WHERE productId = ?
        ORDER BY id DESC
    `, productID)

    if out == nil {
        out = make([]Order, 0)
    }
    return out, err
}

func (r *Repo) Close() error {
	if r.insertStmt != nil {
		return r.insertStmt.Close()
	}
	return nil
}

package repo

type Store interface {
	InsertOrder(o *Order) (int64, error)
	OrdersByProduct(pid int) ([]Order, error)
}

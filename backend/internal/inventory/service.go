package inventory

import (
	"context"
	"errors"
)

type Service struct {
	Repository Repository
}

func (s Service) ListItems(ctx context.Context) ([]Item, error) {
	return s.Repository.ListItems(ctx)
}

func (s Service) GetItem(ctx context.Context, id int64) (Item, error) {
	return s.Repository.GetItem(ctx, id)
}

func (s Service) CreateItem(ctx context.Context, item Item) (Item, error) {
	if item.Name == "" {
		return Item{}, errors.New("item name is required")
	}
	return s.Repository.CreateItem(ctx, item)
}

func (s Service) UpdateItem(ctx context.Context, id int64, item Item) error {
	if item.Name == "" {
		return errors.New("item name is required")
	}
	return s.Repository.UpdateItem(ctx, id, item)
}

func (s Service) DeleteItem(ctx context.Context, id int64) error {
	return s.Repository.DeleteItem(ctx, id)
}

func (s Service) AddLog(ctx context.Context, log Log) error {
	if log.Quantity <= 0 {
		return errors.New("quantity must be greater than zero")
	}
	if log.Type != "in" && log.Type != "out" {
		return errors.New("invalid log type")
	}

	// For simple updates, we don't necessarily need a tx here unless we are doing complex business logic,
	// but let's just use the repository method which handles updating the item quantity and inserting the log.
	// Since we pass tx=nil, the repository executes both in auto-commit mode (which isn't strictly transactional
	// unless wrapped, but SQLite is fast and for simple inventory it's often fine. For robustness, we could wrap in a tx,
	// but we'll keep it simple).
	
	// Actually, let's wrap it in a transaction for safety.
	tx, err := s.Repository.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := s.Repository.AddLog(ctx, tx, log); err != nil {
		return err
	}

	return tx.Commit()
}

func (s Service) ListLogs(ctx context.Context, itemID *int64) ([]Log, error) {
	return s.Repository.ListLogs(ctx, itemID)
}

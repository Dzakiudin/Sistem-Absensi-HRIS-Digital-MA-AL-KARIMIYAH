package madrasah

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type fakeTx struct {
	pgx.Tx
	committed  bool
	rolledBack bool
	commitErr  error
}

func (f *fakeTx) Commit(context.Context) error {
	if f.commitErr != nil {
		return f.commitErr
	}
	f.committed = true
	return nil
}

func (f *fakeTx) Rollback(context.Context) error {
	f.rolledBack = true
	return nil
}

type fakePool struct {
	tx       pgx.Tx
	beginErr error
}

func (p *fakePool) Begin(context.Context) (pgx.Tx, error) {
	if p.beginErr != nil {
		return nil, p.beginErr
	}
	return p.tx, nil
}

func (p *fakePool) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (p *fakePool) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, nil
}

func (p *fakePool) QueryRow(context.Context, string, ...any) pgx.Row {
	return nil
}

func TestTransactorWithTxCommit(t *testing.T) {
	tx := &fakeTx{}
	tr := &Transactor{db: &fakePool{tx: tx}}
	dipanggil := false

	err := tr.WithTx(context.Background(), func(got pgx.Tx) error {
		require.Same(t, tx, got)
		dipanggil = true
		return nil
	})

	require.NoError(t, err)
	require.True(t, dipanggil)
	require.True(t, tx.committed)
	require.False(t, tx.rolledBack)
}

func TestTransactorWithTxRollbackSentinel(t *testing.T) {
	tx := &fakeTx{}
	tr := &Transactor{db: &fakePool{tx: tx}}

	err := tr.WithTx(context.Background(), func(pgx.Tx) error { return errRollback })

	require.ErrorIs(t, err, errRollback)
	require.True(t, tx.rolledBack)
	require.False(t, tx.committed)
}

func TestTransactorWithTxErrorRollsBack(t *testing.T) {
	tx := &fakeTx{}
	boom := errors.New("boom")
	tr := &Transactor{db: &fakePool{tx: tx}}

	err := tr.WithTx(context.Background(), func(pgx.Tx) error { return boom })

	require.ErrorIs(t, err, boom)
	require.True(t, tx.rolledBack)
	require.False(t, tx.committed)
}

func TestTransactorWithTxBeginError(t *testing.T) {
	boom := errors.New("begin gagal")
	tr := &Transactor{db: &fakePool{beginErr: boom}}

	err := tr.WithTx(context.Background(), func(pgx.Tx) error { return nil })

	require.ErrorIs(t, err, boom)
	var ce *commitError
	require.False(t, errors.As(err, &ce))
}

func TestTransactorWithTxCommitError(t *testing.T) {
	tx := &fakeTx{commitErr: errors.New("commit gagal")}
	tr := &Transactor{db: &fakePool{tx: tx}}

	err := tr.WithTx(context.Background(), func(pgx.Tx) error { return nil })

	var ce *commitError
	require.ErrorAs(t, err, &ce)
	require.False(t, tx.committed)
}

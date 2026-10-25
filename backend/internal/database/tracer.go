package database

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type slowQueryTracer struct {
	slowMs int
	debug  bool
}

func newSlowQueryTracer(logLevel string, slowMs int) *slowQueryTracer {
	return &slowQueryTracer{
		slowMs: slowMs,
		debug:  logLevel == "debug",
	}
}

type queryTraceCtxKey struct{}

func (t *slowQueryTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if t.debug {
		slog.Debug("SQL start",
			"sql", truncateSQL(data.SQL, 300),
		)
	}
	return context.WithValue(ctx, queryTraceCtxKey{}, queryTraceInfo{
		sql: data.SQL,
		at:  time.Now(),
	})
}

func (t *slowQueryTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	info, _ := ctx.Value(queryTraceCtxKey{}).(queryTraceInfo)
	dur := time.Since(info.at)
	sql := truncateSQL(info.sql, 300)
	if data.Err != nil {
		slog.Error("SQL error",
			"sql", sql,
			"duration", dur.String(),
			"err", data.Err.Error(),
		)
		return
	}
	if t.slowMs > 0 && dur >= time.Duration(t.slowMs)*time.Millisecond {
		slog.Warn("SQL slow",
			"sql", sql,
			"duration", dur.String(),
			"rows", data.CommandTag.RowsAffected(),
		)
		return
	}
	if t.debug {
		slog.Debug("SQL done",
			"sql", sql,
			"duration", dur.String(),
		)
	}
}

type queryTraceInfo struct {
	sql string
	at  time.Time
}

func truncateSQL(sql string, max int) string {
	sql = strings.Join(strings.Fields(sql), " ")
	if len(sql) <= max {
		return sql
	}
	return sql[:max] + "..."
}

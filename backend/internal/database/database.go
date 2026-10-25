package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Options struct {
	MaxConns    int
	MinConns    int
	LogLevel    string
	SlowQueryMs int
}

func Connect(databaseURL string) (*pgxpool.Pool, error) {
	return ConnectWith(databaseURL, Options{
		MaxConns:    25,
		MinConns:    5,
		LogLevel:    "info",
		SlowQueryMs: 500,
	})
}

func ConnectWith(databaseURL string, opts Options) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	if opts.MaxConns > 0 {
		config.MaxConns = int32(opts.MaxConns)
	}
	if opts.MinConns > 0 {
		config.MinConns = int32(opts.MinConns)
	}
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute
	config.ConnConfig.Tracer = newSlowQueryTracer(opts.LogLevel, opts.SlowQueryMs)

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("✅ PostgreSQL connected")
	return pool, nil
}

func ConnectRedis(redisURL string) *redis.Client {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("⚠️ Failed to parse Redis URL, using defaults: %v", err)
		opts = &redis.Options{Addr: "localhost:6379"}
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := client.Ping(ctx).Result(); err != nil {
		log.Printf("⚠️ Redis not available: %v (continuing without Redis)", err)
	} else {
		log.Println("✅ Redis connected")
	}

	return client
}

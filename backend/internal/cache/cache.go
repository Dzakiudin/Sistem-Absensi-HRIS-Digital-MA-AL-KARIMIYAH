

package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type Store interface {

	Get(ctx context.Context, key string) (value string, ok bool)

	Set(ctx context.Context, key, value string, ttl time.Duration)

	DeletePrefix(ctx context.Context, prefix string)
}

type redisStore struct {
	client *redis.Client
}

func NewRedisStore(client *redis.Client) Store {
	if client == nil {
		return Noop()
	}
	return &redisStore{client: client}
}

func (r *redisStore) Get(ctx context.Context, key string) (string, bool) {
	value, err := r.client.Get(ctx, key).Result()
	if err != nil {
		return "", false
	}
	return value, true
}

func (r *redisStore) Set(ctx context.Context, key, value string, ttl time.Duration) {
	_ = r.client.Set(ctx, key, value, ttl).Err()
}

func (r *redisStore) DeletePrefix(ctx context.Context, prefix string) {
	iter := r.client.Scan(ctx, 0, prefix+"*", 100).Iterator()
	keys := make([]string, 0, 16)
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if len(keys) > 0 {
		_ = r.client.Del(ctx, keys...).Err()
	}
}

type noopStore struct{}

func Noop() Store { return noopStore{} }

func (noopStore) Get(context.Context, string) (string, bool)         { return "", false }
func (noopStore) Set(context.Context, string, string, time.Duration) {}
func (noopStore) DeletePrefix(context.Context, string)               {}

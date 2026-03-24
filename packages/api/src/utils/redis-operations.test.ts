import type { RedisClientType } from "redis";

import {
  checkFixedWindowRateLimit,
  checkSlidingWindowRateLimit,
} from "./redis-operations";

function createMockCache() {
  return {
    expire: vi.fn(),
    incr: vi.fn(),
    zAdd: vi.fn(),
    zCard: vi.fn(),
    zRemRangeByScore: vi.fn(),
  } as unknown as RedisClientType & {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    zRemRangeByScore: ReturnType<typeof vi.fn>;
    zCard: ReturnType<typeof vi.fn>;
    zAdd: ReturnType<typeof vi.fn>;
  };
}

describe(checkFixedWindowRateLimit, () => {
  let mockCache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    mockCache = createMockCache();
  });

  it("sets expiration on first request", async () => {
    mockCache.incr.mockResolvedValue(1);
    mockCache.expire.mockResolvedValue(true);

    const result = await checkFixedWindowRateLimit(
      mockCache,
      "rl:fw:user:123:api/posts:1",
      10,
      60
    );

    expect(result).toStrictEqual({ count: 1, exceeded: false });
    expect(mockCache.incr).toHaveBeenCalledWith("rl:fw:user:123:api/posts:1");
    expect(mockCache.expire).toHaveBeenCalledWith(
      "rl:fw:user:123:api/posts:1",
      60
    );
  });

  it("does not set expiration on subsequent requests", async () => {
    mockCache.incr.mockResolvedValue(5);

    const result = await checkFixedWindowRateLimit(
      mockCache,
      "rl:fw:user:123:api/posts:1",
      10,
      60
    );

    expect(result).toStrictEqual({ count: 5, exceeded: false });
    expect(mockCache.incr).toHaveBeenCalledTimes(1);
    expect(mockCache.expire).not.toHaveBeenCalled();
  });

  it("returns exceeded=false when count equals limit", async () => {
    mockCache.incr.mockResolvedValue(10);

    const result = await checkFixedWindowRateLimit(
      mockCache,
      "rl:fw:user:123:api/posts:1",
      10,
      60
    );

    expect(result).toStrictEqual({ count: 10, exceeded: false });
  });

  it("returns exceeded=true when count exceeds limit", async () => {
    mockCache.incr.mockResolvedValue(11);

    const result = await checkFixedWindowRateLimit(
      mockCache,
      "rl:fw:user:123:api/posts:1",
      10,
      60
    );

    expect(result).toStrictEqual({ count: 11, exceeded: true });
  });

  it("uses correct window seconds for expiration", async () => {
    mockCache.incr.mockResolvedValue(1);
    mockCache.expire.mockResolvedValue(true);

    await checkFixedWindowRateLimit(
      mockCache,
      "rl:fw:ip:127.0.0.1:api/users:5",
      100,
      120
    );

    expect(mockCache.expire).toHaveBeenCalledWith(
      "rl:fw:ip:127.0.0.1:api/users:5",
      120
    );
  });
});

describe(checkSlidingWindowRateLimit, () => {
  let mockCache: ReturnType<typeof createMockCache>;
  const now = 1_704_067_200_000; // 2024-01-01T00:00:00.000Z

  beforeEach(() => {
    mockCache = createMockCache();
  });

  it("removes expired entries and allows request under limit", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(5);
    mockCache.zAdd.mockResolvedValue(1);
    mockCache.expire.mockResolvedValue(true);

    const result = await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      10,
      60,
      now
    );

    expect(result).toStrictEqual({ count: 6, exceeded: false });

    // Verify zRemRangeByScore removes entries older than windowMs
    expect(mockCache.zRemRangeByScore).toHaveBeenCalledWith(
      "rl:sw:user:123:api/posts",
      0,
      now - 60_000
    );
  });

  it("adds new entry with correct score and value", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(3);
    mockCache.zAdd.mockResolvedValue(1);
    mockCache.expire.mockResolvedValue(true);

    await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      10,
      60,
      now
    );

    expect(mockCache.zAdd).toHaveBeenCalledWith("rl:sw:user:123:api/posts", {
      score: now,
      value: now.toString(),
    });
  });

  it("sets expiration with correct window seconds", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(0);
    mockCache.zAdd.mockResolvedValue(1);
    mockCache.expire.mockResolvedValue(true);

    await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      10,
      120,
      now
    );

    expect(mockCache.expire).toHaveBeenCalledWith(
      "rl:sw:user:123:api/posts",
      120
    );
  });

  it("returns exceeded=true when count equals limit", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(10);

    const result = await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      10,
      60,
      now
    );

    expect(result).toStrictEqual({ count: 10, exceeded: true });
    expect(mockCache.zAdd).not.toHaveBeenCalled();
    expect(mockCache.expire).not.toHaveBeenCalled();
  });

  it("returns exceeded=true when count exceeds limit", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(15);

    const result = await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      10,
      60,
      now
    );

    expect(result).toStrictEqual({ count: 15, exceeded: true });
  });

  it("does not add entry when limit exceeded", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(10);

    await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      10,
      60,
      now
    );

    expect(mockCache.zAdd).not.toHaveBeenCalled();
    expect(mockCache.expire).not.toHaveBeenCalled();
  });

  it("calls zAdd and expire in parallel", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(5);

    let zAddResolved = false;
    let expireResolved = false;

    mockCache.zAdd.mockImplementation(() => {
      zAddResolved = true;
      return Promise.resolve(1);
    });
    mockCache.expire.mockImplementation(() => {
      expireResolved = true;
      return Promise.resolve(true);
    });

    await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      10,
      60,
      now
    );

    expect(zAddResolved).toBeTruthy();
    expect(expireResolved).toBeTruthy();
  });

  it("handles edge case with limit of 0", async () => {
    mockCache.zRemRangeByScore.mockResolvedValue(0);
    mockCache.zCard.mockResolvedValue(0);

    const result = await checkSlidingWindowRateLimit(
      mockCache,
      "rl:sw:user:123:api/posts",
      0,
      60,
      now
    );

    expect(result).toStrictEqual({ count: 0, exceeded: true });
  });
});

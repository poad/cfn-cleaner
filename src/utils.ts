import { MetadataBearer } from '@aws-sdk/types';

// バックオフ戦略の種類
enum BackoffStrategy {
  EXPONENTIAL = 'exponential',
  DECORRELATED_JITTER = 'decorrelated-jitter',
  FULL_JITTER = 'full-jitter',
}

interface BackoffConfig {
  /** バックオフ戦略 */
  strategy?: BackoffStrategy;
  /** 初回待機時間（ミリ秒） */
  baseDelay?: number;
  /** 最大待機時間（ミリ秒） */
  maxDelay?: number;
  /** ジッター係数 (0-1) */
  jitterFactor?: number;
}

interface RetryOptions extends BackoffConfig {
  /** 最大リトライ回数 */
  maxAttempts?: number;
}

interface RetryableError extends Error {
  name: string;
  code?: string;
  message: string;
}

interface BackoffCalculator {
  /** 次の待機時間を計算 */
  nextDelay: (attempt: number, prevDelay?: number) => number;
  /** 状態をリセット */
  reset: () => void;
}

/**
 * 指数バックオフ計算機
 */
class ExponentialBackoff implements BackoffCalculator {
  constructor(private config: Required<BackoffConfig>) {}

  nextDelay(attempt: number): number {
    const baseDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
    const delay = Math.min(baseDelay, this.config.maxDelay);
    
    if (this.config.jitterFactor === 0) return delay;
    
    const jitter = delay * this.config.jitterFactor;
    return delay - jitter + (Math.random() * jitter * 2);
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  reset(): void {}
}

/**
 * デコリレーテッドジッターバックオフ計算機
 * Reference: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
class DecorrelatedJitterBackoff implements BackoffCalculator {
  private lastDelay: number;

  constructor(private config: Required<BackoffConfig>) {
    this.lastDelay = config.baseDelay;
  }

  nextDelay(): number {
    const minDelay = this.config.baseDelay;
    const calcDelay = Math.min(
      this.config.maxDelay,
      this.config.jitterFactor * 3 * this.lastDelay,
    );
    
    this.lastDelay = Math.floor(
      minDelay + (Math.random() * (calcDelay - minDelay)),
    );
    
    return this.lastDelay;
  }

  reset(): void {
    this.lastDelay = this.config.baseDelay;
  }
}

/**
 * フルジッターバックオフ計算機
 */
class FullJitterBackoff implements BackoffCalculator {
  constructor(private config: Required<BackoffConfig>) {}

  nextDelay(attempt: number): number {
    const baseDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
    const capDelay = Math.min(baseDelay, this.config.maxDelay);
    return Math.random() * capDelay;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  reset(): void {}
}

/**
 * バックオフ計算機のファクトリ関数
 */
function createBackoffCalculator(config: Required<BackoffConfig>): BackoffCalculator {
  switch (config.strategy) {
    case BackoffStrategy.DECORRELATED_JITTER:
      return new DecorrelatedJitterBackoff(config);
    case BackoffStrategy.FULL_JITTER:
      return new FullJitterBackoff(config);
    case BackoffStrategy.EXPONENTIAL:
    default:
      return new ExponentialBackoff(config);
  }
}

/**
 * AWS APIコールのリトライを行うユーティリティ関数
 */
async function withRetry<TInput extends object, TOutput extends MetadataBearer>(
  operation: (params: TInput) => Promise<TOutput>,
  params: TInput,
  options: RetryOptions = {},
): Promise<TOutput> {
  const config: Required<BackoffConfig> = {
    strategy: options.strategy ?? BackoffStrategy.EXPONENTIAL,
    baseDelay: options.baseDelay ?? 1000,
    maxDelay: options.maxDelay ?? 20000,
    jitterFactor: options.jitterFactor ?? 0.2,
  };
  
  const maxAttempts = options.maxAttempts ?? 3;
  const backoff = createBackoffCalculator(config);
  let attempt = 0;

  while (true) {
    try {
      return await operation(params);
    } catch (error) {
      attempt++;

      if (!isAWSError(error)) {
        throw error;
      }

      const shouldRetry = isRetryableError(error) && attempt < maxAttempts;
      
      if (!shouldRetry) {
        throw error;
      }

      const delay = backoff.nextDelay(attempt);

      console.warn(`Rate exceeded. Retrying attempt ${attempt} after ${delay}ms`, {
        strategy: config.strategy,
        errorName: error.name,
        errorMessage: error.message,
        attempt,
        delay,
      });
      
      await sleep(delay);
    }
  }
}

function isAWSError(error: unknown): error is RetryableError {
  return (
    error instanceof Error &&
    'name' in error &&
    typeof error.name === 'string'
  );
}

function isRetryableError(error: RetryableError): boolean {
  if (
    error.name === 'ThrottlingException' ||
    error.name === 'TooManyRequestsException' ||
    error.name === 'RequestLimitExceeded' ||
    error.code === 'RequestThrottled' ||
    (error.message && error.message.includes('Rate exceeded'))
  ) {
    return true;
  }
  return false;
}

const sleep = (ms: number): Promise<void> => 
  new Promise((resolve) => setTimeout(resolve, ms));

export { withRetry, RetryOptions, BackoffStrategy };

// バックオフ戦略の種類
var BackoffStrategy;
(function (BackoffStrategy) {
    BackoffStrategy["EXPONENTIAL"] = "exponential";
    BackoffStrategy["DECORRELATED_JITTER"] = "decorrelated-jitter";
    BackoffStrategy["FULL_JITTER"] = "full-jitter";
})(BackoffStrategy || (BackoffStrategy = {}));
/**
 * 指数バックオフ計算機
 */
class ExponentialBackoff {
    config;
    constructor(config) {
        this.config = config;
    }
    nextDelay(attempt) {
        const baseDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
        const delay = Math.min(baseDelay, this.config.maxDelay);
        if (this.config.jitterFactor === 0)
            return delay;
        const jitter = delay * this.config.jitterFactor;
        return delay - jitter + (Math.random() * jitter * 2);
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    reset() { }
}
/**
 * デコリレーテッドジッターバックオフ計算機
 * Reference: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
class DecorrelatedJitterBackoff {
    config;
    lastDelay;
    constructor(config) {
        this.config = config;
        this.lastDelay = config.baseDelay;
    }
    nextDelay() {
        const minDelay = this.config.baseDelay;
        const calcDelay = Math.min(this.config.maxDelay, this.config.jitterFactor * 3 * this.lastDelay);
        this.lastDelay = Math.floor(minDelay + (Math.random() * (calcDelay - minDelay)));
        return this.lastDelay;
    }
    reset() {
        this.lastDelay = this.config.baseDelay;
    }
}
/**
 * フルジッターバックオフ計算機
 */
class FullJitterBackoff {
    config;
    constructor(config) {
        this.config = config;
    }
    nextDelay(attempt) {
        const baseDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
        const capDelay = Math.min(baseDelay, this.config.maxDelay);
        return Math.random() * capDelay;
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    reset() { }
}
/**
 * バックオフ計算機のファクトリ関数
 */
function createBackoffCalculator(config) {
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
async function withRetry(operation, params, options = {}) {
    const config = {
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
        }
        catch (error) {
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
function isAWSError(error) {
    return (error instanceof Error &&
        'name' in error &&
        typeof error.name === 'string');
}
function isRetryableError(error) {
    if (error.name === 'ThrottlingException' ||
        error.name === 'TooManyRequestsException' ||
        error.name === 'RequestLimitExceeded' ||
        error.code === 'RequestThrottled' ||
        (error.message && error.message.includes('Rate exceeded'))) {
        return true;
    }
    return false;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export { withRetry, BackoffStrategy };

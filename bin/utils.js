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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsYUFBYTtBQUNiLElBQUssZUFJSjtBQUpELFdBQUssZUFBZTtJQUNsQiw4Q0FBMkIsQ0FBQTtJQUMzQiw4REFBMkMsQ0FBQTtJQUMzQyw4Q0FBMkIsQ0FBQTtBQUM3QixDQUFDLEVBSkksZUFBZSxLQUFmLGVBQWUsUUFJbkI7QUErQkQ7O0dBRUc7QUFDSCxNQUFNLGtCQUFrQjtJQUNGO0lBQXBCLFlBQW9CLE1BQStCO1FBQS9CLFdBQU0sR0FBTixNQUFNLENBQXlCO0lBQUcsQ0FBQztJQUV2RCxTQUFTLENBQUMsT0FBZTtRQUN2QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUV4RCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxLQUFLLENBQUM7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUVqRCxNQUFNLE1BQU0sR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUM7UUFDaEQsT0FBTyxLQUFLLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsZ0VBQWdFO0lBQ2hFLEtBQUssS0FBVSxDQUFDO0NBQ2pCO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSx5QkFBeUI7SUFHVDtJQUZaLFNBQVMsQ0FBUztJQUUxQixZQUFvQixNQUErQjtRQUEvQixXQUFNLEdBQU4sTUFBTSxDQUF5QjtRQUNqRCxJQUFJ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
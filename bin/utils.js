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
        jitterFactor: options.jitterFactor ?? 0.2
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
                delay
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
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export { withRetry, BackoffStrategy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsYUFBYTtBQUNiLElBQUssZUFJSjtBQUpELFdBQUssZUFBZTtJQUNsQiw4Q0FBMkIsQ0FBQTtJQUMzQiw4REFBMkMsQ0FBQTtJQUMzQyw4Q0FBMkIsQ0FBQTtBQUM3QixDQUFDLEVBSkksZUFBZSxLQUFmLGVBQWUsUUFJbkI7QUErQkQ7O0dBRUc7QUFDSCxNQUFNLGtCQUFrQjtJQUNGO0lBQXBCLFlBQW9CLE1BQStCO1FBQS9CLFdBQU0sR0FBTixNQUFNLENBQXlCO0lBQUcsQ0FBQztJQUV2RCxTQUFTLENBQUMsT0FBZTtRQUN2QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUV4RCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxLQUFLLENBQUM7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUVqRCxNQUFNLE1BQU0sR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUM7UUFDaEQsT0FBTyxLQUFLLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsS0FBSyxLQUFVLENBQUM7Q0FDakI7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLHlCQUF5QjtJQUdUO0lBRlosU0FBUyxDQUFTO0lBRTFCLFlBQW9CLE1BQStCO1FBQS9CLFdBQU0sR0FBTixNQUFNLENBQXlCO1FBQ2pELElBQUksQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQztJQUNwQyxDQUFDO0lBRUQsU0FBUztRQUNQLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3ZDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FDOUMsQ0FBQztRQUVGLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FDekIsUUFBUSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQ3BELENBQUM7UUFFRixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDeEIsQ0FBQztJQUVELEtBQUs7UUFDSCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO0lBQ3pDLENBQUM7Q0FDRjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxpQkFBaUI7SUFDRDtJQUFwQixZQUFvQixNQUErQjtRQUEvQixXQUFNLEdBQU4sTUFBTSxDQUF5QjtJQUFHLENBQUM7SUFFdkQsU0FBUyxDQUFDLE9BQWU7UUFDdkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0QsT0FBTyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxLQUFLLEtBQVUsQ0FBQztDQUNqQjtBQUVEOztHQUVHO0FBQ0gsU0FBUyx1QkFBdUIsQ0FBQyxNQUErQjtJQUM5RCxRQUFRLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN4QixLQUFLLGVBQWUsQ0FBQyxtQkFBbUI7WUFDdEMsT0FBTyxJQUFJLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9DLEtBQUssZUFBZSxDQUFDLFdBQVc7WUFDOUIsT0FBTyxJQUFJLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZDLEtBQUssZUFBZSxDQUFDLFdBQVcsQ0FBQztRQUNqQztZQUNFLE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMxQyxDQUFDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLFNBQVMsQ0FDdEIsU0FBK0MsRUFDL0MsTUFBYyxFQUNkLFVBQXdCLEVBQUU7SUFFMUIsTUFBTSxNQUFNLEdBQTRCO1FBQ3RDLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLGVBQWUsQ0FBQyxXQUFXO1FBQ3pELFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxJQUFJLElBQUk7UUFDcEMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRLElBQUksS0FBSztRQUNuQyxZQUFZLEVBQUUsT0FBTyxDQUFDLFlBQVksSUFBSSxHQUFHO0tBQzFDLENBQUM7SUFFRixNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQztJQUM3QyxNQUFNLE9BQU8sR0FBRyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNoRCxJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7SUFFaEIsT0FBTyxJQUFJLEVBQUUsQ0FBQztRQUNaLElBQUksQ0FBQztZQUNILE9BQU8sTUFBTSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLEVBQUUsQ0FBQztZQUVWLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDdkIsTUFBTSxLQUFLLENBQUM7WUFDZCxDQUFDO1lBRUQsTUFBTSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksT0FBTyxHQUFHLFdBQVcsQ0FBQztZQUVyRSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sS0FBSyxDQUFDO1lBQ2QsQ0FBQztZQUVELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFekMsT0FBTyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsT0FBTyxVQUFVLEtBQUssSUFBSSxFQUFFO2dCQUMxRSxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVE7Z0JBQ3pCLFNBQVMsRUFBRSxLQUFLLENBQUMsSUFBSTtnQkFDckIsWUFBWSxFQUFFLEtBQUssQ0FBQyxPQUFPO2dCQUMzQixPQUFPO2dCQUNQLEtBQUs7YUFDTixDQUFDLENBQUM7WUFFSCxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQixDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxLQUFjO0lBQ2hDLE9BQU8sQ0FDTCxLQUFLLFlBQVksS0FBSztRQUN0QixNQUFNLElBQUksS0FBSztRQUNmLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLENBQy9CLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxLQUFxQjtJQUM3QyxJQUNFLEtBQUssQ0FBQyxJQUFJLEtBQUsscUJBQXFCO1FBQ3BDLEtBQUssQ0FBQyxJQUFJLEtBQUssMEJBQTBCO1FBQ3pDLEtBQUssQ0FBQyxJQUFJLEtBQUssc0JBQXNCO1FBQ3JDLEtBQUssQ0FBQyxJQUFJLEtBQUssa0JBQWtCO1FBQ2pDLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUMxRCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxLQUFLLEdBQUcsQ0FBQyxFQUFVLEVBQWlCLEVBQUUsQ0FDMUMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFFbEQsT0FBTyxFQUFFLFNBQVMsRUFBZ0IsZUFBZSxFQUFFLENBQUMifQ==
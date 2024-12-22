import { MetadataBearer } from '@aws-sdk/types';
declare enum BackoffStrategy {
    EXPONENTIAL = "exponential",
    DECORRELATED_JITTER = "decorrelated-jitter",
    FULL_JITTER = "full-jitter"
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
/**
 * AWS APIコールのリトライを行うユーティリティ関数
 */
declare function withRetry<TInput extends object, TOutput extends MetadataBearer>(operation: (params: TInput) => Promise<TOutput>, params: TInput, options?: RetryOptions): Promise<TOutput>;
export { withRetry, RetryOptions, BackoffStrategy };
//# sourceMappingURL=utils.d.ts.map
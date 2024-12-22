/**
 * AWS CloudFormation Stack Cleanup Tool
 *
 * このスクリプトは指定されたプレフィックスに一致するCloudFormationスタックを一括で削除します。
 * 安全性のため、削除前に確認プロンプトを表示します。
 *
 * @requires @aws-sdk/client-cloudformation - AWSのCloudFormation操作用SDK
 * @requires arg - コマンドライン引数のパース
 * @requires chalk-template - コンソール出力の装飾
 * @requires log4js - ロギング
 */
import * as fs from 'fs';
import readline from 'readline';
import path from 'path';
import { CloudFormationClient, DeleteStackCommand, ListStacksCommand, StackStatus, waitUntilStackDeleteComplete, } from '@aws-sdk/client-cloudformation';
import arg from 'arg';
import chalkTemplate from 'chalk-template';
import log4js from 'log4js';
import { BackoffStrategy, withRetry } from './utils.js';
// ロガーの設定
log4js.configure({
    appenders: {
        out: {
            type: 'stdout',
            layout: {
                type: 'pattern',
                pattern: '%m%n',
            },
        },
    },
    categories: { default: { appenders: ['out'], level: 'info' } },
});
const logger = log4js.getLogger();
const rl = readline.createInterface(process.stdin, process.stdout);
/**
 * ユーザーに質問を表示し、入力を待ち受けます
 * @param message - 表示するプロンプトメッセージ
 * @returns ユーザーの入力値
 */
const question = (message) => new Promise((resolve) => {
    rl.question(message, (answer) => {
        resolve(answer);
        rl.close();
    });
});
/**
 * 削除確認のプロンプトを表示し、ユーザーの応答を待ち受けます
 * @returns 確認が承認された場合はtrue、それ以外はfalse
 */
const confirm = async () => {
    const answer = await question('Remove Stacks? [y/n] ');
    const lowerAnswer = answer.toLowerCase();
    if (lowerAnswer === 'y' || lowerAnswer === 'yes') {
        return true;
    }
    if (lowerAnswer === 'n' || lowerAnswer === 'no') {
        return false;
    }
    return confirm();
};
/**
 * 指定された条件に一致するCloudFormationスタックの一覧を取得します
 * @param client - CloudFormationクライアントインスタンス
 * @param nextToken - ページネーショントークン
 * @returns スタックのサマリー情報の配列
 */
const listStacks = async (client, nextToeken) => {
    const response = await client.send(new ListStacksCommand({
        StackStatusFilter: [
            StackStatus.CREATE_COMPLETE,
            StackStatus.CREATE_FAILED,
            StackStatus.DELETE_FAILED,
            StackStatus.IMPORT_COMPLETE,
            StackStatus.IMPORT_IN_PROGRESS,
            StackStatus.IMPORT_ROLLBACK_COMPLETE,
            StackStatus.IMPORT_ROLLBACK_FAILED,
            StackStatus.ROLLBACK_COMPLETE,
            StackStatus.ROLLBACK_FAILED,
            StackStatus.UPDATE_COMPLETE,
            StackStatus.UPDATE_FAILED,
            StackStatus.UPDATE_ROLLBACK_COMPLETE,
            StackStatus.UPDATE_ROLLBACK_FAILED,
        ],
        NextToken: nextToeken,
    }));
    const summaries = response.StackSummaries ?? [];
    if (response.NextToken) {
        return summaries.concat(await listStacks(client, response.NextToken));
    }
    return summaries;
};
/**
 * コマンドライン引数の定義
 */
const argDef = {
    '--help': {
        type: Boolean,
        alias: '-h',
    },
    '--version': {
        type: Boolean,
        alias: '-v',
    },
    '--prefix': {
        type: String,
        alias: '-p',
    },
    '--region': {
        type: String,
        alias: '-r',
    },
    '--yes': {
        type: Boolean,
        alias: '-y',
    },
};
// 引数オプションの設定を生成
const options = Object.keys(argDef)
    .map((key) => {
    const target = {};
    target[key] = argDef[key].type;
    return target;
})
    .reduce((cur, acc) => Object.assign(acc, cur));
// エイリアスの設定を生成
const aliases = Object.keys(argDef)
    .map((key) => {
    const target = {};
    target[argDef[key].alias] = key;
    return target;
})
    .reduce((cur, acc) => Object.assign(acc, cur));
const argConfig = {
    ...options,
    ...aliases,
};
/**
 * 指定された時間だけ処理を停止します
 * @param time - 待機時間（ミリ秒）
 */
const sleep = async (time) => new Promise((resolve) => {
    setTimeout(() => {
        resolve();
    }, time);
});
/**
 * 配列を指定されたサイズのチャンクに分割します
 * @param array - 分割する配列
 * @param size - チャンクサイズ
 * @returns 分割された配列の配列
 */
function arrayChunk([...array], size = 1) {
    return array.reduce((acc, __value, index) => (index % size ? acc : [...acc, array.slice(index, index + size)]), []);
}
try {
    const args = arg(argConfig);
    const packageJson = JSON.parse(Buffer.from(fs.readFileSync(path.resolve('package.json'), { flag: 'r' })).toString());
    // ヘルプメッセージの定義
    const helpMessage = chalkTemplate `
  {bold USAGE}
      {dim $} {bold ${Object.keys(packageJson.bin).pop()}} [--help] --string {underline some-arg}
  {bold OPTIONS}
      --help                         Shows this help message
      --version                      Print version of this module
      --prefix {underline prefix-of-stack-name}  the prefix for name of CloudFormation Stack
      --region {underline region}                the region of CloudFormation Stack
`;
    if (args['--help'] !== undefined) {
        logger.error(helpMessage);
        process.exit(0);
    }
    if (args['--version'] !== undefined) {
        logger.info(packageJson.version);
        process.exit(0);
    }
    const prefix = args['--prefix'];
    if (!prefix) {
        logger.error('Prefix is required');
        logger.error(helpMessage);
        process.exit(1);
    }
    logger.info(`Prefix: ${prefix}`);
    const region = args['--region'];
    if (region) {
        logger.info(`Region: ${region}`);
    }
    const yes = args['--yes'];
    // CloudFormationクライアントの初期化
    const client = new CloudFormationClient({
        region,
    });
    // スタックの一覧を取得
    const stacks = (await listStacks(client))
        .filter((stack) => (prefix ? stack.StackName?.startsWith(prefix) : true));
    logger.info(`Remove stacks\n${stacks
        .map((stack) => `\t${stack.StackName}`)
        .reduce((acc, cur) => `${acc}\n${cur}`)}`);
    if (yes || await confirm()) {
        const stackNames = stacks
            .map((stack) => stack.StackName)
            .filter((stackNames) => stackNames !== undefined);
        // スタックを3個ずつのバッチに分けて削除
        const resps = arrayChunk(stackNames, 3)
            .flatMap((stackNames) => {
            const resps = stackNames.map(async (StackName) => {
                logger.debug(`stack: ${StackName}`);
                return sleep(3000).then(async () => {
                    // リトライロジックを含むスタック削除の実行
                    const resp = await withRetry(() => client.send(new DeleteStackCommand({
                        StackName,
                    })), {}, {
                        strategy: BackoffStrategy.DECORRELATED_JITTER,
                        maxAttempts: 3,
                        baseDelay: 30000,
                        maxDelay: 300000,
                        jitterFactor: 1
                    });
                    await waitUntilStackDeleteComplete({ client, maxWaitTime: 60 * 3 }, { StackName });
                    return resp;
                });
            });
            return resps;
        });
        Promise.all(resps).then(() => logger.info('done'));
    }
    else {
        logger.info('canceled');
    }
}
catch {
    process.exit(1);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7O0dBVUc7QUFFSCxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLFFBQVEsTUFBTSxVQUFVLENBQUM7QUFDaEMsT0FBTyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQ3hCLE9BQU8sRUFDTCxvQkFBb0IsRUFDcEIsa0JBQWtCLEVBQ2xCLGlCQUFpQixFQUNqQixXQUFXLEVBRVgsNEJBQTRCLEdBQzdCLE1BQU0sZ0NBQWdDLENBQUM7QUFFeEMsT0FBTyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQ3RCLE9BQU8sYUFBYSxNQUFNLGdCQUFnQixDQUFDO0FBQzNDLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUV4RCxTQUFTO0FBQ1QsTUFBTSxDQUFDLFNBQVMsQ0FBQztJQUNmLFNBQVMsRUFBRTtRQUNULEdBQUcsRUFBRTtZQUNILElBQUksRUFBRSxRQUFRO1lBQ2QsTUFBTSxFQUFFO2dCQUNOLElBQUksRUFBRSxTQUFTO2dCQUNmLE9BQU8sRUFBRSxNQUFNO2FBQ2hCO1NBQ0Y7S0FDRjtJQUNELFVBQVUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRTtDQUMvRCxDQUFDLENBQUM7QUFDSCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7QUFFbEMsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUVuRTs7OztHQUlHO0FBQ0gsTUFBTSxRQUFRLEdBQUcsQ0FBQyxPQUFlLEVBQW1C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
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
                        jitterFactor: 1,
                    });
                    await waitUntilStackDeleteComplete({ client, maxWaitTime: 60 * 3 }, { StackName });
                    return resp;
                });
            });
            return resps;
        });
        // eslint-disable-next-line promise/catch-or-return
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
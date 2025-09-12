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

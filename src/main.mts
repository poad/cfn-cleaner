import {
  CloudFormationClient,
  DeleteStackCommand,
  ListStacksCommand,
  StackStatus,
  StackSummary,
  waitUntilStackDeleteComplete,
} from '@aws-sdk/client-cloudformation';
import * as fs from 'fs';
import readline from 'readline';

import arg from 'arg';
import chalkTemplate from 'chalk-template';
import log4js from 'log4js';
import path from 'path';

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

const question = (message: string): Promise<string> => new Promise((resolve) => {
  rl.question(message, (answer) => {
    resolve(answer);
    rl.close();
  });
});

const confirm = async (): Promise<boolean> => {
  const answer = await question('Remove Stacks? [y/n] ');
  const lowerAnswer = answer.toLowerCase();
  if (lowerAnswer === 'y' || lowerAnswer === 'yes') {
    return true;
  } if (lowerAnswer === 'n' || lowerAnswer === 'no') {
    return false;
  }
  return confirm();
};

// eslint-disable-next-line max-len
const listStacks = async (client: CloudFormationClient, nextToeken: string | undefined = undefined): Promise<StackSummary[]> => {
  const response = await client.send(new ListStacksCommand({
    StackStatusFilter: [
      StackStatus.CREATE_COMPLETE,
      StackStatus.CREATE_FAILED,
      // StackStatus.CREATE_IN_PROGRESS,
      StackStatus.DELETE_FAILED,
      // StackStatus.DELETE_IN_PROGRESS,
      StackStatus.IMPORT_COMPLETE,
      StackStatus.IMPORT_IN_PROGRESS,
      StackStatus.IMPORT_ROLLBACK_COMPLETE,
      StackStatus.IMPORT_ROLLBACK_FAILED,
      // StackStatus.IMPORT_ROLLBACK_IN_PROGRESS,
      // StackStatus.REVIEW_IN_PROGRESS,
      StackStatus.ROLLBACK_COMPLETE,
      StackStatus.ROLLBACK_FAILED,
      // StackStatus.ROLLBACK_IN_PROGRESS,
      StackStatus.UPDATE_COMPLETE,
      // StackStatus.UPDATE_COMPLETE_CLEANUP_IN_PROGRESS,
      StackStatus.UPDATE_FAILED,
      // StackStatus.UPDATE_IN_PROGRESS,
      StackStatus.UPDATE_ROLLBACK_COMPLETE,
      // StackStatus.UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS,
      StackStatus.UPDATE_ROLLBACK_FAILED,
      // StackStatus.UPDATE_ROLLBACK_IN_PROGRESS,
    ],
    NextToken: nextToeken,
  }));

  const summaries = response.StackSummaries === undefined ? [] : response.StackSummaries;

  if (response.NextToken) {
    return summaries.concat(await listStacks(client, response.NextToken));
  }
  return summaries;
};

interface ArgsDefinition {
  [key: string]: {
    type: StringConstructor | BooleanConstructor | NumberConstructor;
    alias: string;
  };
}

interface Options {
  [key: string]: StringConstructor | BooleanConstructor | NumberConstructor;
}
interface Aliases {
  [key: string]: string;
}

const argDef: ArgsDefinition = {
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
};

const options: Options = Object.keys(argDef)
  .map((key) => {
    const target: Options = {};
    target[key] = argDef[key].type;
    return target;
  })
  .reduce((cur, acc) => Object.assign(acc, cur));

const aliases: Aliases = Object.keys(argDef)
  .map((key) => {
    const target: Aliases = {};
    target[argDef[key].alias] = key;
    return target;
  })
  .reduce((cur, acc) => Object.assign(acc, cur));

const argConfig = {
  // Types
  ...options,

  // Aliases
  ...aliases,
};

const sleep = async (time: number) => new Promise<void>((resolve) => {
  setTimeout(() => {
    resolve();
  }, time);
});

function arrayChunk<T>([...array]: T[], size: number = 1): T[][] {
  // eslint-disable-next-line max-len
  return array.reduce((acc, __value, index) => (index % size ? acc : [...acc, array.slice(index, index + size)]), [] as T[][]);
}

try {
  const args = arg(argConfig);

  const packageJson = JSON.parse(Buffer.from(fs.readFileSync(path.resolve('package.json'), { flag: 'r' })).toString());

  const helpMessage = chalkTemplate`
  {bold USAGE}
      {dim $} {bold ${Object.keys(packageJson.bin).pop()}} [--help] --string {underline some-arg}
  {bold OPTIONS}
      --help                 Shows this help message
      --version              Print version of this module
      --prefix {underline prefix-of-stack-name}  the prefix for name of CloudFormation Stack
`;

  if (args['--help'] !== undefined) {
    logger.error(helpMessage);
    process.exit(0);
  }

  if (args['--version'] !== undefined) {
    logger.info(packageJson.version);
    process.exit(0);
  }

  const prefix = args['--prefix']!;
  logger.info(`Prefix: ${prefix}`);

  const client = new CloudFormationClient({
  });

  const stacks = (await listStacks(client))
    .filter((stack) => (prefix ? stack.StackName?.startsWith(prefix) : true));
  logger.info(`Remove stacks\n${stacks
    .map((stack) => `\t${stack.StackName}`)
    .reduce((acc, cur) => `${acc}\n${cur}`)}`);

  if (await confirm()) {
    /* eslint-disable no-shadow */
    const stackNames = stacks
      .map((stack) => stack.StackName)
      .filter((stackNames) => stackNames !== undefined);
    /* eslint-enable no-shadow */

    /* eslint-disable no-shadow */
    const resps = arrayChunk<string>(stackNames as string[], 10)
      .flatMap(
        (stackNames) => {
          const resps = stackNames.map(async (StackName) => {
            logger.debug(`stack: ${StackName}`);
            return sleep(3000).then(async () => {
              const resp = await client.send(new DeleteStackCommand({
                StackName,
              }))
                .catch(
                  (e) => {
                    logger.error(e);
                  },
                );
              await waitUntilStackDeleteComplete({ client, maxWaitTime: 60 * 3 }, { StackName });
              return resp;
            });
          });
          return resps;
        },
      );
    /* eslint-enable no-shadow */

    Promise.all(resps).then(() => logger.info('done'));
  } else {
    logger.info('canceled');
  }
} catch (e) {
  // logger.error(e);
  process.exit(1);
}

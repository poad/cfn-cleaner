# cfn-cleaner

## Usage

For the variable `PREFIX_OF_CLOUDFORMATION_STACK_NAMES`, specify the prefix of CloudFormation stack names that you want to delete.

```shell
node bin/cli.js --prefix ${PREFIX_OF_CLOUDFORMATION_STACK_NAMES}
```

You can check detailed usage by specifying the --help option.

## Limitation

When trying to delete a large number of CloudFormation stacks, an error may occur during the process. In that case, please retry.

#!/usr/bin/env node

/**
 * 纷享销客CLI工具 - 主入口文件
 * 用于解析命令行参数并执行相应的命令
 */

const { program } = require('commander');
const path = require('path');
const chalk = require('chalk');
const { version } = require('../package.json');
const { ConfigManager } = require('../src/core/ConfigManager');
const { ErrorHandler } = require('../src/core/ErrorHandler');
const { logger } = require('../src/core/Logger');

// 设置全局错误处理器
ErrorHandler.setupGlobalHandlers();

const configManager = new ConfigManager();

// 记录启动信息
logger.info(`fx-cli v${version} 启动`);

// 添加版本信息
program.version(version, '-v, --version', '显示版本号');

// 注册子命令
const registerCommands = () => {
  try {
    // 引入Jenkins命令模块
  const jenkinsCommand = require('../src/commands/jenkins');
    
    logger.debug('开始注册命令');
    
    // 认证相关命令
    program
      .command('auth')
      .description('登录或管理认证状态和配置')
      .option('-l, --logout', '登出当前账号')
      .option('-s, --status', '查看认证状态')
      .option('-p, --project-config', '创建并使用项目级配置')
      .option('-g, --use-global', '使用全局配置(默认)')
      .action(async (options) => {
        const authCommand = require('../src/commands/auth');
        await authCommand.execute(options);
      });



    // 项目管理命令
    program
      .command('init [project-name]')
      .description('初始化项目（不指定项目名则在当前目录初始化）')
      .option('-t, --template <template>', '指定模板')
      .option('-d, --domain <domain>', '指定服务域名')
      .option('-c, --certificate <certificate>', '指定认证证书')
      .option('-n, --name <name>', '配置名称')
      .action(async (projectName, options) => {
        const initCommand = require('../src/commands/init');
        await initCommand.execute(projectName || '.', options);
      });

    program
      .command('create')
      .description('创建组件/插件/函数/类')
      .argument('[type]', '组件类型')
      .argument('[name]', '组件名称')
      .option('-p, --path <path>', '指定创建路径')
      .option('-t, --sub-type <type>', '子类型 (component/plugin支持vue/ava)')
      .option('-a, --api-name <apiName>', 'API名称')
      .option('-l, --lang <lang>', '语言 (function/class支持groovy/java)')
      .option('-n, --name-space <nameSpace>', '命名空间')
      .option('-r, --return-type <returnType>', '返回类型 (function专用)')
      .option('-b, --binding-object-api-name <apiName>', '绑定的业务对象API名称 (function专用)')
      .option('-lns, --list-namespaces', '查看支持的命名空间清单')
      .action(async (type, name, options) => {
        const createCommand = require('../src/commands/create');
        await createCommand.execute(type, name, options);
      });

    // 代码同步命令
    program
      .command('pull [name]')
      .description('拉取代码')
      .option('-t, --type <type>', '指定类型: component/plugin/function/class')
      .option('-o, --output <dir>', '指定输出目录')
      .option('-a, --all', '拉取所有项目')
      .action(async (name, options) => {
        const pullCommand = require('../src/commands/pull');
        await pullCommand.execute(name, options);
      });

    // 代码部署命令
    program
      .command('push [name]')
      .description('推送代码')
      .option('-t, --type <type>', '指定类型: component/plugin/function/class')
      .option('-f, --file <file>', '指定单个文件路径（用于推送单个文件）')
      .option('-p, --path <path>', '指定单个文件名（用于推送单个文件，仅支持function和class类型）')
      .option('-n, --new', '推送新类（用于推送在服务端不存在的类）')
      .option('-a, --all', '推送所有组件/插件/函数/类')
      .action(async (name, options) => {
        const pushCommand = require('../src/commands/push');
        await pushCommand.execute(name, options);
      });

    program
      .command('deploy [name]')
      .description('推送并部署')
      .option('-t, --type <type>', '指定类型: component/plugin/function/class')
      .option('-e, --env <env>', '指定环境: dev/test/prod')
      .action(async (name, options) => {
        const deployCommand = require('../src/commands/deploy');
        await deployCommand.execute(name, options);
      });

    // 注册jenkins命令
    const jenkins = program.command('jenkins')
      .description('Jenkins流水线部署相关命令')
      .alias('j')
      .action(async (options) => {
        const jenkinsCommand = require('../src/commands/jenkins');
        await jenkinsCommand.execute(options);
      });
      
    // 配置jenkins子命令
    jenkins.command('setup')
      .description('配置Jenkins连接信息')
      .action(async () => {
        const setupCommand = require('../src/commands/jenkins/setup');
        await setupCommand.execute();
      });
      
    jenkins.command('build <jobName>')
      .description('触发Jenkins任务构建')
      .option('-p, --parameters <parameters>', '构建参数（JSON格式字符串）', '')
      .action(async (jobName, options) => {
        const buildCommand = require('../src/commands/jenkins/build');
        await buildCommand.execute({ ...options, jobName });
      });
      
    jenkins.command('status <jobName> [buildNumber]')
      .description('查询Jenkins构建状态')
      .action(async (jobName, buildNumber) => {
        const statusCommand = require('../src/commands/jenkins/status');
        await statusCommand.execute({ jobName, buildNumber });
      });
      
    jenkins.command('log <jobName> [buildNumber]')
      .description('查看Jenkins构建日志')
      .option('-f, --follow', '实时跟踪日志输出')
      .action(async (jobName, buildNumber, options) => {
        const logCommand = require('../src/commands/jenkins/log');
        await logCommand.execute({ ...options, jobName, buildNumber });
      });

    // Jenkins集成命令
    program
      .command('jenkins')
      .description('Jenkins集成相关命令')
      .addCommand(
        new program.Command('setup')
          .description('配置Jenkins集成')
          .action(async () => {
            const jenkinsSetupCommand = require('../src/commands/jenkins/setup');
            await jenkinsSetupCommand.execute();
          })
      )
      .addCommand(
        new program.Command('pipeline')
          .description('列出所有Jenkins流水线')
          .action(async () => {
            const jenkinsPipelineCommand = require('../src/commands/jenkins/pipeline');
            await jenkinsPipelineCommand.execute();
          })
      )
      .addCommand(
        new program.Command('build <name>')
          .description('触发Jenkins构建')
          .option('-p, --params <params>', '指定构建参数，格式为JSON')
          .action(async (name, options) => {
            const jenkinsBuildCommand = require('../src/commands/jenkins/build');
            await jenkinsBuildCommand.execute(name, options);
          })
      )
      .addCommand(
        new program.Command('status <id>')
          .description('查看构建状态')
          .action(async (id) => {
            const jenkinsStatusCommand = require('../src/commands/jenkins/status');
            await jenkinsStatusCommand.execute(id);
          })
      );

    // 工具命令
    program
      .command('config')
      .description('配置CLI工具')
      .option('-g, --get <key>', '获取配置项')
      .option('-s, --set <key> <value>', '设置配置项')
      .option('-l, --list', '列出所有配置')
      .action(async (options) => {
        const configCommand = require('../src/commands/config');
        await configCommand.execute(options);
      });

    program
      .command('help')
      .description('显示帮助信息')
      .action(() => {
        program.outputHelp();
      });
  } catch (error) {
    logger.error('命令注册失败', error);
    console.error('[错误] 注册命令时出错:', error.message);
    process.exit(1);
  }
};

// 主函数
const main = async () => {
  try {
    // 注册命令
    registerCommands();
    logger.debug('所有命令注册完成');

    // 解析命令行参数
    program.parse(process.argv);

    // 如果没有指定命令，显示帮助信息
    if (process.argv.length < 3) {
      program.outputHelp();
    }
  } catch (error) {
    logger.error('命令执行失败', error);
    const exitCode = ErrorHandler.handleCommandError(error, 'main');
    console.error('[错误] 执行命令时出错:', error.message);
    console.error('[提示] 请使用 fx-cli help 查看使用方法');
    process.exit(exitCode);
  }
};

// 执行主函数
main();
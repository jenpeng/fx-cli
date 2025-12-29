/**
 * Jenkins命令主入口
 * 集成所有Jenkins相关的子命令
 */
const { program } = require('commander');
const setupCommand = require('./jenkins/setup');
const buildCommand = require('./jenkins/build');
const statusCommand = require('./jenkins/status');
const logCommand = require('./jenkins/log');

/**
 * 配置Jenkins命令及其子命令
 * @param {Object} parentProgram - 父级program对象
 */
function configureJenkinsCommand(parentProgram) {
  const jenkins = parentProgram.command('jenkins')
    .description('Jenkins流水线部署相关命令')
    .alias('j');

  // Jenkins配置命令
  jenkins.command('setup')
    .description('配置Jenkins连接信息')
    .action(async () => {
      try {
        await setupCommand.execute();
      } catch (error) {
        console.error('执行Jenkins设置命令时出错:', error);
        process.exit(1);
      }
    });

  // 触发构建命令
  jenkins.command('build <jobName>')
    .description('触发Jenkins任务构建')
    .option('-p, --parameters <parameters>', '构建参数（JSON格式字符串）', '')
    .action(async (jobName, options) => {
      try {
        await buildCommand.execute({ ...options, jobName });
      } catch (error) {
        console.error('执行Jenkins构建命令时出错:', error);
        process.exit(1);
      }
    });

  // 查询构建状态命令
  jenkins.command('status <jobName> [buildNumber]')
    .description('查询Jenkins构建状态')
    .action(async (jobName, buildNumber) => {
      try {
        await statusCommand.execute({ jobName, buildNumber });
      } catch (error) {
        console.error('执行Jenkins状态查询命令时出错:', error);
        process.exit(1);
      }
    });

  // 查看构建日志命令
  jenkins.command('log <jobName> [buildNumber]')
    .description('查看Jenkins构建日志')
    .option('-f, --follow', '实时跟踪日志输出')
    .action(async (jobName, buildNumber, options) => {
      try {
        await logCommand.execute({ ...options, jobName, buildNumber });
      } catch (error) {
        console.error('执行Jenkins日志查看命令时出错:', error);
        process.exit(1);
      }
    });
}

/**
 * 导出execute函数，用于兼容主入口的动态调用
 * @param {Object} options - 命令选项
 */
async function execute(options) {
  // 创建临时program实例来处理子命令
  const tempProgram = new program.Command();
  configureJenkinsCommand(tempProgram);
  
  // 解析并执行命令
  tempProgram.parse(process.argv);
}

module.exports = { execute, configureJenkinsCommand };

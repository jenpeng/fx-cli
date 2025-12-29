/**
 * Jenkins构建日志命令
 * 用于查看Jenkins任务的构建日志
 */
const ora = require('ora');
const chalk = require('chalk');
const { ConfigManager } = require('../../core/ConfigManager');
const { jenkinsService } = require('../../services/jenkinsService');

/**
 * 执行Jenkins构建日志查看命令
 * @param {Object} options - 命令选项
 * @param {string} options.jobName - 任务名称
 * @param {number|string} options.buildNumber - 构建编号，不提供则获取最新构建
 * @param {boolean} options.follow - 是否实时跟踪日志
 * @returns {Promise<void>}
 */
async function execute(options) {
  const spinner = ora('正在获取Jenkins构建日志...').start();
  
  try {
    // 检查Jenkins配置
    const configManager = new ConfigManager();
    const jenkinsConfig = configManager.getConfig('jenkins');
    
    if (!jenkinsConfig || !jenkinsConfig.url || !jenkinsConfig.username || !jenkinsConfig.token) {
      spinner.fail(chalk.red('Jenkins未配置'));
      console.error(chalk.yellow('请先运行 `fx-cli jenkins setup` 命令配置Jenkins连接信息'));
      return;
    }
    
    const { jobName, buildNumber, follow } = options;
    
    if (!jobName) {
      spinner.fail(chalk.red('任务名称不能为空'));
      return;
    }
    
    spinner.text = `正在获取任务 ${chalk.cyan(jobName)} 的构建日志...`;
    
    if (follow) {
      // 实时跟踪日志
      spinner.succeed(chalk.green('开始实时跟踪构建日志'));
      console.log(chalk.yellow('提示: 按 Ctrl+C 停止跟踪\n'));
      
      await jenkinsService.streamBuildLog(jobName, buildNumber, (chunk) => {
        console.log(formatLogChunk(chunk));
      });
    } else {
      // 获取完整日志
      const log = await jenkinsService.getBuildLog(jobName, buildNumber);
      
      if (log) {
        spinner.succeed(chalk.green('构建日志获取成功'));
        console.log(chalk.cyan('\n=== 构建日志 ==='));
        console.log(formatLogChunk(log));
        console.log(chalk.cyan('=== 日志结束 ==='));
      } else {
        spinner.fail(chalk.red('构建日志获取失败，可能是任务不存在或构建编号无效'));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red('获取构建日志时发生错误'));
    console.error(chalk.red(`错误信息: ${error.message}`));
  }
}

/**
 * 格式化日志块，添加颜色高亮
 * @param {string} chunk - 日志块
 * @returns {string} 格式化后的日志
 */
function formatLogChunk(chunk) {
  if (!chunk) return '';
  
  return chunk
    .replace(/\[ERROR\]/g, chalk.red('[ERROR]'))
    .replace(/\[WARNING\]/g, chalk.yellow('[WARNING]'))
    .replace(/\[INFO\]/g, chalk.blue('[INFO]'))
    .replace(/\[SUCCESS\]/g, chalk.green('[SUCCESS]'))
    .replace(/\bERROR\b/g, chalk.red('ERROR'))
    .replace(/\bWARNING\b/g, chalk.yellow('WARNING'))
    .replace(/\bINFO\b/g, chalk.blue('INFO'))
    .replace(/\bSUCCESS\b/g, chalk.green('SUCCESS'));
}

module.exports = { execute };

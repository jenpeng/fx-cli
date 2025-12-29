/**
 * Jenkins构建状态命令
 * 用于查询Jenkins任务的构建状态
 */
const ora = require('ora');
const chalk = require('chalk');
const { ConfigManager } = require('../../core/ConfigManager');
const { jenkinsService } = require('../../services/jenkinsService');

/**
 * 执行Jenkins构建状态查询命令
 * @param {Object} options - 命令选项
 * @param {string} options.jobName - 任务名称
 * @param {number|string} options.buildNumber - 构建编号，不提供则获取最新构建
 * @returns {Promise<void>}
 */
async function execute(options) {
  const spinner = ora('正在查询Jenkins构建状态...').start();
  
  try {
    // 检查Jenkins配置
    const configManager = new ConfigManager();
    const jenkinsConfig = configManager.getConfig('jenkins');
    
    if (!jenkinsConfig || !jenkinsConfig.url || !jenkinsConfig.username || !jenkinsConfig.token) {
      spinner.fail(chalk.red('Jenkins未配置'));
      console.error(chalk.yellow('请先运行 `fx-cli jenkins setup` 命令配置Jenkins连接信息'));
      return;
    }
    
    const { jobName, buildNumber } = options;
    
    if (!jobName) {
      spinner.fail(chalk.red('任务名称不能为空'));
      return;
    }
    
    spinner.text = `正在查询任务 ${chalk.cyan(jobName)} 的构建状态...`;
    
    // 查询构建状态
    const status = await jenkinsService.getBuildStatus(jobName, buildNumber);
    
    if (status) {
      spinner.succeed(chalk.green('构建状态查询成功'));
      console.log(chalk.cyan(`\n构建状态信息:`));
      console.log(chalk.white(`  任务名称: ${status.jobName}`));
      console.log(chalk.white(`  构建编号: ${status.number}`));
      console.log(chalk.white(`  构建状态: ${getStatusColor(status.result || status.building ? '构建中' : '未知')}`));
      console.log(chalk.white(`  构建URL: ${status.url}`));
      console.log(chalk.white(`  构建时间: ${new Date(status.timestamp).toLocaleString()}`));
      
      if (status.duration) {
        console.log(chalk.white(`  持续时间: ${formatDuration(status.duration)}`));
      }
      
      if (status.result === 'SUCCESS') {
        console.log(chalk.green('  构建结果: 成功'));
      } else if (status.result === 'FAILURE') {
        console.log(chalk.red('  构建结果: 失败'));
      } else if (status.result === 'ABORTED') {
        console.log(chalk.yellow('  构建结果: 已中止'));
      }
      
      console.log(chalk.yellow(`\n提示: 使用 fx-cli jenkins log ${jobName} ${status.number} 查看构建日志`));
    } else {
      spinner.fail(chalk.red('构建状态查询失败，可能是任务不存在或构建编号无效'));
    }
  } catch (error) {
    spinner.fail(chalk.red('查询构建状态时发生错误'));
    console.error(chalk.red(`错误信息: ${error.message}`));
  }
}

/**
 * 格式化持续时间
 * @param {number} milliseconds - 毫秒数
 * @returns {string} 格式化后的时间字符串
 */
function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 获取带颜色的状态文本
 * @param {string} status - 状态文本
 * @returns {string} 带颜色的文本
 */
function getStatusColor(status) {
  switch (status) {
    case 'SUCCESS':
      return chalk.green(status);
    case 'FAILURE':
      return chalk.red(status);
    case 'ABORTED':
      return chalk.yellow(status);
    case '构建中':
      return chalk.blue(status);
    default:
      return chalk.gray(status);
  }
}

module.exports = { execute };

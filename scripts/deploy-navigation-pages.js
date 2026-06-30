const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const DEFAULT_PROJECT_NAME = 'gaode-navigation';

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const projectArg = args.find((arg) => arg.startsWith('--project-name='));
const branchArg = args.find((arg) => arg.startsWith('--branch='));
const projectName = projectArg ? projectArg.slice('--project-name='.length) : (process.env.CLOUDFLARE_PAGES_PROJECT || DEFAULT_PROJECT_NAME);
const branch = branchArg ? branchArg.slice('--branch='.length) : (process.env.CLOUDFLARE_PAGES_BRANCH || 'main');

function log(message) {
  console.log(`[pages-nav] ${message}`);
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed`);
  }
}

function copyDxfFilesToDist() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error('dist directory does not exist. Build the project first.');
  }

  const dxfFiles = fs.readdirSync(ROOT).filter((name) => name.toLowerCase().endsWith('.dxf'));
  if (!dxfFiles.length) throw new Error('No .dxf file found in project root.');

  for (const name of dxfFiles) {
    fs.copyFileSync(path.join(ROOT, name), path.join(DIST_DIR, name));
  }
  log(`Copied ${dxfFiles.length} DXF file(s) into dist.`);
}

function main() {
  if (!noBuild) {
    log('Building frontend...');
    run(commandName('npm'), ['run', 'build']);
  }

  copyDxfFilesToDist();

  log(`Deploying dist to Cloudflare Pages project "${projectName}" on branch "${branch}"...`);
  run(commandName('npx'), [
    '--yes',
    'wrangler',
    'pages',
    'deploy',
    'dist',
    '--project-name',
    projectName,
    '--branch',
    branch,
    '--commit-dirty=true'
  ]);
}

try {
  main();
} catch (error) {
  console.error(`[pages-nav] ${error.message}`);
  console.error('[pages-nav] If this is the first deploy, run: npm run public:nav:login');
  process.exit(1);
}

import { readdirSync, writeFile, readFileSync, rename, rmdirSync } from 'fs';
import { join, resolve } from 'path';
import {logError, logSuccess, logTitle, logWarning} from 'nodejs-logger-n';

import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

let pluginConfig = {};
let indexPageConfigValue = true;

/**
 * Finds project root folder
 * @param dir
 * @returns {string}
 */
const findConfig = (dir=__dirname) => {
  let ls = readdirSync(dir);
  if(ls.includes('node_modules'))
    return dir;
  else if(dir === resolve('/'))
    throw new Error(`Could not find project root`);
  else
    return findConfig(resolve(dir,'..'));
};

/**
 * Read config file
 * @returns {Promise<void>}
 */
const getConfigFromFile = () => {
  const rootDirName = findConfig();
  const filePath = resolve(rootDirName, 'pagesconfig.json');
  const data = readFileSync(filePath, 'utf8');
  indexPageConfigValue = JSON.parse(data).enableIndexPage;
};

/**
 * Gets all pages based on project structure.
 * Each folder in src/pages corresponds to a single page.
 * Such folder must contain pug index file to serve as an entry point.
 * @return {*[]}
 */
const getPages = (function () {
  let pages = [];
  return () => {
    // Return cached pages
    if (pages.length) return pages;

    // Find all pages
    readdirSync(pluginConfig.pagesDir, { withFileTypes: true })
      .filter((dir) => dir.isDirectory())
      .forEach((dir) => {
        const indexFile = getPageIndex(dir.name);
        indexFile &&
          pages.push({
            name: dir.name,
            src: `/pages/${dir.name}/`,
            path: resolve(pluginConfig.pagesDir, dir.name, indexFile),
          });
      });
    return pages;
  };
})();

/**
 * Gets all pages for the project
 */
export function getRollupInput(config, isDev = false) {
  // Get config
  pluginConfig = config;
  getConfigFromFile();
  pluginConfig.enableIndexPage = pluginConfig.enableIndexPage === undefined ? indexPageConfigValue : pluginConfig.enableIndexPage;

  // Generate JSON file
  const pages = getPages().map((page) => page.path);
  pluginConfig.enableIndexPage && generatePagesJSON();

  // Add index page if in dev
  isDev && pages.push(join(pluginConfig.pagesDir, 'index.pug'));
  return pages;
}

/**
 * Gets pug index file from a page folder.
 * Returns false if no entry point was found.
 * @param dirName - name of the folder
 * @return {false|string}
 */
function getPageIndex(dirName) {
  const indexFile = readdirSync(join(pluginConfig.pagesDir, dirName)).find((file) => file === 'index.pug');
  return !!indexFile && join(pluginConfig.pagesDir, dirName, indexFile);
}

/**
 * Saves pages configuration to a json file
 */
function generatePagesJSON() {
  // Form json data
  const json = {
    links: [],
  };
  getPages().forEach((page) => {
    json.links.push(page);
  });

  // Write to file
  writeFile(`${pluginConfig.root}/pages/pages.json`, JSON.stringify(json), 'utf8', (errors) => {
    //region Logs
    console.log();
    logTitle('Pages Configuration');
    if (!errors) {
      logSuccess('Successfully configured pages.json');
    } else {
      logError('Failed to configure pages.json');
      console.error(errors);
    }
    console.log();
    //endregion
  });
}

/**
 * Vite plugin used to restructure folders after building
 * @return {{closeBundle(): void}}
 */
export default function vitePluginMPA(isDev = true) {
  return {
    closeBundle() {
      if (isDev) return;

      console.log();
      logTitle('Restructuring Dist folder');

      const rootPath = process.cwd();
      const distPath = resolve(rootPath, 'dist');
      const distFolder = readdirSync(distPath);

      if (distFolder.includes('pages')) {
        const pagesPath = resolve(distPath, 'pages');
        const pagesFolder = readdirSync(pagesPath);

        pagesFolder.forEach((dirName) => {
          const currentFolder = readdirSync(resolve(pagesPath, dirName));
          if (currentFolder.includes('index.html')) {
            rename(join(pagesPath, dirName, 'index.html'), join(pagesPath, `${dirName}.html`), (error) => {
              if (error) {
                logWarning(`Failed to restructure page ${dirName}`);
                console.error(error);
              } else {
                rmdirSync(join(pagesPath, dirName));
              }
            });
          } else {
            logWarning(`Failed to restructure page ${dirName}: No index file was found`);
          }
        });

        logSuccess('Finished restructuring Dist folder');
      } else {
        logWarning('Failed to restructure pages: No pages folder was found');
      }
      console.log();
    },
  };
}

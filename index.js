import { promises, readdirSync, writeFile, readFile } from 'fs';
import { join, resolve } from 'path';
import { logError, logSuccess, logTitle } from 'nodejs-logger-n';

import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

let pluginConfig = {};
let indexPageConfigValue = true;

/**
 * Finds project root folder
 * @param dir
 * @returns {Promise<*|undefined>}
 */
const findConfig = async (dir=__dirname) => {
  let ls = await promises.readdir(dir);
  if(ls.includes('node_modules'))
    return dir;
  else if(dir == '/')
    throw new Error(`Could not find project root`);
  else
    return findConfig(resolve(dir,'..'));
}

/**
 * Read config file
 * @returns {Promise<void>}
 */
const getConfigFromFile = async () => {
  const rootDirName = await findConfig();
  const filePath = resolve(rootDirName, 'pagesconfig.json');
  readFile(filePath, 'utf8', (err, data) => {
    if (!err){
      indexPageConfigValue = JSON.parse(data).enableIndexPage;
    }
  })
}

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
            src: `/${dir.name}/`,
            path: resolve(pluginConfig.pagesDir, dir.name, indexFile),
          });
      });
    return pages;
  };
})();

/**
 * Gets all pages for the project
 */
export async function getRollupInput(config, isDev = false) {
  // Get config
  pluginConfig = config;
  await getConfigFromFile();
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
  writeFile(`${pluginConfig.root}/pages.json`, JSON.stringify(json), 'utf8', (errors) => {
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

// metro.config.js
// Fix: EAS Build runs Metro from the monorepo root, so we must explicitly
// set projectRoot to __dirname (mobile/) so that relative imports like
// '../../constants/theme' resolve correctly from within mobile/app/(tabs)/.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

module.exports = config;

// Auto-discovered by web-ext (build/sign/lint/run) so the shipped extension
// package only contains what actually needs to run in the browser - not
// repo tooling, docs, or dev dependencies.
module.exports = {
  ignoreFiles: [
    'package.json',
    'package-lock.json',
    'README.md',
    'ROADMAP.md',
    'CHANGELOG.md',
    'LISTING.md',
    'amo-metadata.json',
    'reviews-state.json',
    'web-ext-config.js',
    'scripts/**/*',
    'tests/**/*',
    '.github/**/*',
  ],
};

/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module */

const sharedBuild = { ...require("./package.json").build };
delete sharedBuild.publish;

module.exports = {
  ...sharedBuild,
  appId: "com.nomi.app.preview",
  productName: "Nomi Preview",
  directories: {
    ...sharedBuild.directories,
    output: "release-preview",
  },
  artifactName: "${productName}-${os}-${arch}.${ext}",
};

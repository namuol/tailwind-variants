import resolveConfig from "@namuol/tailwindcss/resolveConfig";

import {generateTypes} from "./generator";

const regExp = {
  tv: /tv\({[\s\S]*?}\)/g,
  tvContent: /\({[\s\S]*?}\)/g,
  comment: /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm,
  blankLine: /^\s*$(?:\r\n?|\n)/gm,
  extension: /\.\w+/g,
};

const isArray = (param) => Array.isArray(param);

const isString = (param) => typeof param === "string";

const isObject = (param) => typeof param === "object";

const isFunction = (param) => typeof param === "function";

const isEmpty = (param) => {
  if (!param) return true;
  if (isArray(param) && param.length === 0) return true;
  if (isString(param) && param.length === 0) return true;
  if (isObject(param) && Object.keys(param).length === 0) return true;

  return false;
};

const printError = (message, error) => {
  const newIssueLink = "https://github.com/nextui-org/tailwind-variants/issues/new/choose";

  /* eslint-disable no-console */
  console.log("\x1b[31m%s\x1b[0m", `${message}: ${error.message}`);
  console.log(`If you think this is an issue, please submit it at ${newIssueLink}`);
  /* eslint-enable no-console */
};

const pipeline = (...funcs) => {
  return (input) => funcs.reduce((acc, func) => func(acc), input);
};

const getCleanContent = (content) => {
  const removeComment = content.replace(regExp.comment, "$1").toString();
  const removeBlankLine = removeComment.replace(regExp.blankLine, "").toString();

  return removeBlankLine.match(regExp.tv);
};

const getTVObjects = (content) => {
  const tvs = getCleanContent(content);

  if (isEmpty(tvs)) return;

  return tvs.map((tv) => {
    /**
     * avoid direct eval
     * @see https://esbuild.github.io/content-types/#direct-eval
     */
    return new Function(`return ${tv.match(regExp.tvContent).toString()}`)();
  });
};

const flatClassNames = (classNames) => {
  return classNames
    .flatMap((classNameSet) => classNameSet)
    .toString()
    .replaceAll(",", " ")
    .split(" ");
};

const getSlots = (classNames, screens) => {
  // responsive slot
  let rs = {};

  for (const [slotName, slotClassNames] of Object.entries(classNames)) {
    rs[slotName] = {};
    rs[slotName].original = slotClassNames;

    if (isEmpty(slotClassNames)) continue;

    rs.temp = isArray(slotClassNames) ? flatClassNames(slotClassNames) : slotClassNames.split(" ");

    screens.forEach((screen) => {
      let tempClassNames = "";

      rs.temp.forEach((className) => {
        tempClassNames += `${screen}:${className} `;
      });

      rs[slotName][screen] = tempClassNames.trimEnd();
    });

    delete rs.temp;
  }

  return rs;
};

const getVariants = (classNames, screens) => {
  if (isString(classNames)) return classNames.split(" ");
  if (isArray(classNames)) return flatClassNames(classNames);
  if (isObject(classNames)) return getSlots(classNames, screens);

  return classNames;
};

const transformContent = (tv, screens) => {
  const {variants = {}} = tv;

  if (isEmpty(variants)) return;

  let responsive = {};

  for (const [variantName, variant] of Object.entries(variants)) {
    responsive[variantName] = {};
    if (isEmpty(variant)) continue;

    for (const [variantType, variantClassNames] of Object.entries(variant)) {
      responsive[variantName][variantType] = {};
      responsive[variantName][variantType].original = variantClassNames;

      if (isEmpty(variantClassNames)) continue;

      const formattedClassNames = getVariants(variantClassNames, screens);

      if (isEmpty(formattedClassNames)) continue;

      // slots
      if (!isArray(formattedClassNames)) {
        responsive[variantName][variantType] = formattedClassNames;
        continue;
      }

      // variants
      screens.forEach((screen) => {
        let tempClassNames = "";

        formattedClassNames.forEach((className) => {
          tempClassNames += `${screen}:${className} `;
        });

        responsive[variantName][variantType][screen] = tempClassNames.trimEnd();
      });
    }
  }

  return responsive;
};

export const tvTransformer = (content, file, screens) => {
  try {
    // TODO: support package alias
    if (!content.includes("tailwind-variants")) return content;

    const tvs = getTVObjects(content);

    if (isEmpty(tvs)) return content;

    const transformed = JSON.stringify(
      tvs.map((tv) => transformContent(tv, screens)),
      undefined,
      2,
    );

    const prefix = "\n/* Tailwind Variants Transformed Content Start\n\n";
    const suffix = "\n\nTailwind Variants Transformed Content End */\n";

    return content.concat(prefix + transformed + suffix);
  } catch (error) {
    printError("Tailwind Variants Transform Failed", error);

    return content;
  }
};

const getExtensions = (files) => {
  const extensions = files
    .map((file) => {
      if (isObject(file) && file.extension) return file.extension;

      let fileExt = file.match(regExp.extension);

      if (!fileExt) {
        fileExt = file.split("{");
        fileExt = fileExt.pop().replace("}", "").split(",");
      }

      return fileExt.map((ext) => ext.replace(".", "").split(".")).flat();
    })
    .flatMap((ext) => ext);

  return Array.from(new Set(extensions)).filter((ext) => ext !== "html");
};

export const withTV = (tailwindConfig) => {
  let config = resolveConfig(tailwindConfig);

  // generate types
  generateTypes(config.theme);

  // invalid content files
  if (isEmpty(config.content?.files) || !isArray(config.content.files)) return config;

  // with tailwind configured screens
  const transformer = (content, file) => {
    return tvTransformer(content, file, Object.keys(config.theme?.screens ?? {}));
  };

  // custom transform
  const customTransform = config.content.transform;

  // extend transform
  if (isEmpty(customTransform)) {
    const extensions = getExtensions(config.content.files);
    const transformEntries = extensions.map((ext) => [ext, transformer]);

    config.content.transform = Object.fromEntries(transformEntries);

    return config;
  }

  // extend transform function
  if (isFunction(customTransform)) {
    const extensions = getExtensions(config.content.files);
    const transformEntries = extensions.map((ext) => [
      ext,
      (input, ...rest) => customTransform(transformer(input, ...rest), ...rest),
    ]);

    config.content.transform = Object.fromEntries(transformEntries);

    return config;
  }

  // extend transform object
  if (isObject(customTransform)) {
    const extensions = getExtensions(config.content.files);
    const transformEntries = extensions.map((ext) => {
      const validTransform = isFunction(customTransform[ext]);

      return validTransform
        ? [ext, pipeline(transformer, customTransform[ext])]
        : [ext, transformer];
    });

    config.content.transform = Object.fromEntries(transformEntries);

    return config;
  }

  return config;
};

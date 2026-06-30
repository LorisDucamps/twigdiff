const TWIG_CONTROL_KEYWORDS = new Set([
  "if",
  "elseif",
  "else",
  "endif",
  "for",
  "endfor",
]);
const SPECIAL_LINK_PROTOCOLS = ["mailto:", "tel:", "sms:"];
const ABSOLUTE_IMAGE_SRC_REGEX = /^(https?:)?\/\/|^cid:|^data:/i;
const HTTPS_LINK_REGEX = /^https:\/\//i;
const NON_ASCII_CHAR_REGEX = /[^\u0000-\u007f]/;
const XHTML_TRANSITIONAL_DOCTYPE_REGEX =
  /<!DOCTYPE\s+html\s+PUBLIC\s+"-\/\/W3C\/\/DTD XHTML 1\.0 Transitional\/\/EN"\s+"http:\/\/www\.w3\.org\/TR\/xhtml1\/DTD\/xhtml1-transitional\.dtd"\s*>/i;
const EXTRA_ALLOWED_ATTRIBUTES = new Set(["xmlns"]);
const XHTML_TRANSITIONAL_ALLOWED_ATTRIBUTES = {
  img: new Set(["alt"]),
  style: new Set(["type"]),
  table: new Set(["border"]),
};
const XHTML_TRANSITIONAL_ATTRIBUTE_VALUE_RULES = {
  body: {
    alink: { type: "color" },
    background: { type: "url" },
    bgcolor: { type: "color" },
    link: { type: "color" },
    text: { type: "color" },
    vlink: { type: "color" },
  },
  div: {
    align: { type: "enum", values: ["left", "center", "right", "justify"] },
  },
  hr: {
    align: { type: "enum", values: ["left", "center", "right"] },
    size: { type: "integer" },
    width: { type: "length" },
  },
  img: {
    align: {
      type: "enum",
      values: [
        "left",
        "right",
        "top",
        "middle",
        "bottom",
        "baseline",
        "texttop",
        "absmiddle",
        "absbottom",
      ],
    },
    border: { type: "integer" },
    height: { type: "length" },
    hspace: { type: "integer" },
    vspace: { type: "integer" },
    width: { type: "length" },
  },
  p: {
    align: { type: "enum", values: ["left", "center", "right", "justify"] },
  },
  table: {
    align: { type: "enum", values: ["left", "center", "right"] },
    background: { type: "url" },
    bgcolor: { type: "color" },
    border: { type: "integer" },
    cellpadding: { type: "integer" },
    cellspacing: { type: "integer" },
    width: { type: "length", allowAuto: true },
  },
  tbody: {
    align: { type: "enum", values: ["left", "center", "right", "justify"] },
    valign: { type: "enum", values: ["top", "middle", "bottom", "baseline"] },
  },
  td: {
    align: {
      type: "enum",
      values: ["left", "center", "right", "justify", "char"],
    },
    background: { type: "url" },
    bgcolor: { type: "color" },
    colspan: { type: "integer" },
    height: { type: "length" },
    rowspan: { type: "integer" },
    valign: { type: "enum", values: ["top", "middle", "bottom", "baseline"] },
    width: { type: "length" },
  },
  tfoot: {
    align: { type: "enum", values: ["left", "center", "right", "justify"] },
    valign: { type: "enum", values: ["top", "middle", "bottom", "baseline"] },
  },
  th: {
    align: {
      type: "enum",
      values: ["left", "center", "right", "justify", "char"],
    },
    background: { type: "url" },
    bgcolor: { type: "color" },
    colspan: { type: "integer" },
    height: { type: "length" },
    rowspan: { type: "integer" },
    valign: { type: "enum", values: ["top", "middle", "bottom", "baseline"] },
    width: { type: "length" },
  },
  thead: {
    align: { type: "enum", values: ["left", "center", "right", "justify"] },
    valign: { type: "enum", values: ["top", "middle", "bottom", "baseline"] },
  },
  tr: {
    align: {
      type: "enum",
      values: ["left", "center", "right", "justify", "char"],
    },
    background: { type: "url" },
    bgcolor: { type: "color" },
    valign: { type: "enum", values: ["top", "middle", "bottom", "baseline"] },
  },
};
const EMPTY_CONDITION_BALANCE = {
  ifTotal: 0,
  endifTotal: 0,
  forTotal: 0,
  endforTotal: 0,
  isIfBalanced: true,
  isForBalanced: true,
  isBalanced: true,
};

let htmlValidationEnvPromise = null;

function createEmptyValidationState() {
  return {
    varsA: {},
    varsB: {},
    condA: {},
    condB: {},
    validationA: [],
    validationB: [],
    htmlValidationA: [],
    htmlValidationB: [],
    conditionBalanceA: EMPTY_CONDITION_BALANCE,
    conditionBalanceB: EMPTY_CONDITION_BALANCE,
  };
}

async function getHtmlValidationEnv() {
  if (!htmlValidationEnvPromise) {
    htmlValidationEnvPromise = Promise.all([
      import("html-validate/browser"),
      import("html-validate/elements/html5"),
    ]).then(([browserModule, elementsModule]) => {
      const { HtmlValidate } = browserModule;
      const html5Elements = elementsModule.default;

      return {
        HTML_VALIDATOR: new HtmlValidate({
          rules: {
            "prefer-tbody": "off",
          },
        }),
        html5Elements,
        HTML_GLOBAL_ATTRIBUTES: new Set(
          Object.keys(html5Elements["*"]?.attributes || {}),
        ),
      };
    });
  }

  return htmlValidationEnvPromise;
}

function extractTwig(regex, html, getKey) {
  const result = {};
  let match;

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1].trim();
    const key = getKey(raw);

    if (!result[key]) {
      result[key] = {
        raws: {},
      };
    }

    result[key].raws[raw] = (result[key].raws[raw] || 0) + 1;
  }

  return result;
}

function countTwigVariables(html) {
  const regex = /{{\s*([\s\S]*?)\s*}}/g;
  return extractTwig(regex, html, (raw) => raw.split("|")[0].trim());
}

function countTwigConditions(html) {
  const regex = /{%\s*([\s\S]*?)\s*%}/g;
  return extractTwig(regex, html, (raw) => raw.split(/\s+/)[0]);
}

function getLineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function getLineStartIndex(text, lineNumber) {
  if (lineNumber <= 1) {
    return 0;
  }

  let currentLine = 1;
  let start = 0;

  while (currentLine < lineNumber && start < text.length) {
    const nextBreak = text.indexOf("\n", start);

    if (nextBreak === -1) {
      return text.length;
    }

    start = nextBreak + 1;
    currentLine += 1;
  }

  return start;
}

function findUnexpectedTwigKeyword(tokens) {
  return tokens.find((token) => TWIG_CONTROL_KEYWORDS.has(token));
}

function validateTwigControlStructures(html) {
  const regex = /{%\s*([\s\S]*?)\s*%}/g;
  const errors = [];
  const stack = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1].trim();
    const fullTag = match[0];
    const line = getLineNumber(html, match.index);
    const parts = raw.split(/\s+/).filter(Boolean);
    const keyword = parts[0];
    const restTokens = parts.slice(1);
    const rest = restTokens.join(" ");
    const tagStart = match.index;
    const tagEnd = match.index + fullTag.length;

    if (!TWIG_CONTROL_KEYWORDS.has(keyword)) {
      continue;
    }

    const unexpectedKeyword = findUnexpectedTwigKeyword(restTokens);

    if (unexpectedKeyword) {
      errors.push({
        category: "twig",
        line,
        tag: raw,
        start: tagStart,
        end: tagEnd,
        message: `Balise invalide: "${unexpectedKeyword}" doit etre dans sa propre balise Twig.`,
      });
      continue;
    }

    if (keyword === "if" || keyword === "for") {
      if (!rest) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `La balise "{% ${keyword} %}" doit contenir une condition ou une expression.`,
        });
        continue;
      }

      stack.push({
        keyword,
        line,
        hasElse: false,
        start: tagStart,
        end: tagEnd,
      });
      continue;
    }

    if (keyword === "elseif") {
      const currentBlock = stack[stack.length - 1];

      if (!rest) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `La balise "{% elseif %}" doit contenir une condition.`,
        });
        continue;
      }

      if (!currentBlock || currentBlock.keyword !== "if") {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `"{% elseif %}" doit etre place a l'interieur d'un bloc "{% if %}".`,
        });
        continue;
      }

      if (currentBlock.hasElse) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `"{% elseif %}" ne peut pas apparaitre apres un "{% else %}".`,
        });
      }
      continue;
    }

    if (keyword === "else") {
      const currentBlock = stack[stack.length - 1];

      if (rest) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `La balise "{% else %}" ne doit pas contenir d'expression.`,
        });
        continue;
      }

      if (!currentBlock || !["if", "for"].includes(currentBlock.keyword)) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `"{% else %}" doit etre rattache a un bloc "{% if %}" ou "{% for %}".`,
        });
        continue;
      }

      if (currentBlock.hasElse) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `Un bloc "{% ${currentBlock.keyword} %}" ne peut contenir qu'un seul "{% else %}".`,
        });
        continue;
      }

      currentBlock.hasElse = true;
      continue;
    }

    if (keyword === "endif" || keyword === "endfor") {
      const expectedOpeningTag = keyword === "endif" ? "if" : "for";
      const currentBlock = stack[stack.length - 1];

      if (rest) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `La balise "{% ${keyword} %}" ne doit pas contenir d'expression.`,
        });
        continue;
      }

      if (!currentBlock || currentBlock.keyword !== expectedOpeningTag) {
        errors.push({
          category: "twig",
          line,
          tag: raw,
          start: tagStart,
          end: tagEnd,
          message: `"{% ${keyword} %}" ne correspond a aucune ouverture "{% ${expectedOpeningTag} %}".`,
        });
        continue;
      }

      stack.pop();
    }
  }

  stack.forEach((block) => {
    errors.push({
      category: "twig",
      line: block.line,
      tag: block.keyword,
      start: block.start,
      end: block.end,
      message: `Le bloc "{% ${block.keyword} %}" ouvert ligne ${block.line} n'a pas de fermeture "{% end${block.keyword} %}".`,
    });
  });

  return errors;
}

function parseHtmlAttributes(attributesSource) {
  const attributes = {};
  const duplicates = [];
  const parsedAttributes = [];
  const regex =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = regex.exec(attributesSource)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";

    parsedAttributes.push({
      name,
      value,
      start: match.index,
      end: match.index + match[0].length,
    });

    if (Object.prototype.hasOwnProperty.call(attributes, name)) {
      duplicates.push({
        name,
        value,
      });
      continue;
    }

    attributes[name] = value;
  }

  return {
    attributes,
    duplicates,
    parsedAttributes,
  };
}

function normalizeUrlValue(value) {
  return value.trim();
}

function hasXhtmlTransitionalDoctype(html) {
  return XHTML_TRANSITIONAL_DOCTYPE_REGEX.test(html);
}

function isDynamicTwigValue(value) {
  return value.includes("{{") || value.includes("{%");
}

function getLineText(text, lineNumber) {
  return text.split("\n")[lineNumber - 1]?.trim() || "";
}

function resolveSnippetRangeOnLine(text, lineNumber, snippet) {
  const lineStart = getLineStartIndex(text, lineNumber);
  const lineEnd = text.indexOf("\n", lineStart);
  const safeLineEnd = lineEnd === -1 ? text.length : lineEnd;
  const lineText = text.slice(lineStart, safeLineEnd);

  if (!snippet) {
    return { start: lineStart, end: safeLineEnd };
  }

  const trimmedSnippet = snippet.trim();
  const directIndex = lineText.indexOf(trimmedSnippet);

  if (directIndex !== -1) {
    return {
      start: lineStart + directIndex,
      end: lineStart + directIndex + trimmedSnippet.length,
    };
  }

  return { start: lineStart, end: safeLineEnd };
}

function validateDoctype(html) {
  const regex = /<!DOCTYPE[\s\S]*?>/i;
  const match = regex.exec(html);

  if (!match || XHTML_TRANSITIONAL_DOCTYPE_REGEX.test(match[0])) {
    return [];
  }

  return [
    {
      category: "doctype",
      line: getLineNumber(html, match.index || 0),
      snippet: match[0],
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
      message:
        "Le doctype detecte ne correspond pas au XHTML 1.0 Transitional attendu.",
    },
  ];
}

function isKnownHtmlElement(tagName, env) {
  return Object.prototype.hasOwnProperty.call(env.html5Elements, tagName);
}

function isDynamicAttributeName(name) {
  return /[{%}]/.test(name);
}

function isCustomOrNamespacedTag(tagName) {
  return tagName.includes("-") || tagName.includes(":");
}

function isNamespacedAttribute(attributeName) {
  return attributeName.includes(":");
}

function isAllowedHtmlAttribute(tagName, attributeName, useXhtml, env) {
  if (
    attributeName.startsWith("data-") ||
    attributeName.startsWith("aria-") ||
    attributeName.startsWith("xmlns:") ||
    isNamespacedAttribute(attributeName)
  ) {
    return true;
  }

  if (EXTRA_ALLOWED_ATTRIBUTES.has(attributeName)) {
    return true;
  }

  if (useXhtml) {
    const transitionalAttributes =
      XHTML_TRANSITIONAL_ALLOWED_ATTRIBUTES[tagName];

    if (transitionalAttributes?.has(attributeName)) {
      return true;
    }
  }

  if (env.HTML_GLOBAL_ATTRIBUTES.has(attributeName)) {
    return true;
  }

  const elementAttributes = env.html5Elements[tagName]?.attributes || {};
  return Object.prototype.hasOwnProperty.call(elementAttributes, attributeName);
}

function getHtmlAttributeDefinition(tagName, attributeName, env) {
  const elementAttributes = env.html5Elements[tagName]?.attributes || {};

  if (Object.prototype.hasOwnProperty.call(elementAttributes, attributeName)) {
    return elementAttributes[attributeName];
  }

  const globalAttributes = env.html5Elements["*"]?.attributes || {};
  return globalAttributes[attributeName];
}

function getCustomAttributeValueRule(tagName, attributeName) {
  return XHTML_TRANSITIONAL_ATTRIBUTE_VALUE_RULES[tagName]?.[attributeName];
}

function isColorValue(value) {
  return (
    /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ||
    /^[a-z]+$/i.test(value) ||
    /^rgb(a)?\(/i.test(value)
  );
}

function isUrlValue(value) {
  return (
    /^(https?:)?\/\//i.test(value) ||
    /^cid:/i.test(value) ||
    /^data:/i.test(value) ||
    /^{{|^{%/i.test(value) ||
    /^[^/]+\//.test(value) ||
    /^[a-z0-9._-]+$/i.test(value)
  );
}

function validateValueAgainstRule(rule, value) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (rule.type === "enum") {
    if (!rule.values.includes(normalizedValue.toLowerCase())) {
      return `Valeur invalide "${value}". Valeurs attendues: ${rule.values.join(", ")}.`;
    }

    return null;
  }

  if (rule.type === "integer") {
    if (!/^\d+$/.test(normalizedValue)) {
      return `Valeur invalide "${value}". Un entier est attendu.`;
    }

    return null;
  }

  if (rule.type === "length") {
    if (rule.allowAuto && normalizedValue.toLowerCase() === "auto") {
      return null;
    }

    if (!/^\d+%?$/.test(normalizedValue)) {
      return `Valeur invalide "${value}". Une longueur numerique ou en % est attendue.`;
    }

    return null;
  }

  if (rule.type === "color") {
    if (!isColorValue(normalizedValue)) {
      return `Valeur invalide "${value}". Une couleur HTML est attendue.`;
    }

    return null;
  }

  if (rule.type === "url" && !isUrlValue(normalizedValue)) {
    return `Valeur invalide "${value}". Une URL ou un chemin compatible email est attendu.`;
  }

  return null;
}

function validateValueAgainstMetadata(definition, value) {
  if (!definition?.enum || !value.trim()) {
    return null;
  }

  const valuesToTest = definition.list ? value.trim().split(/\s+/) : [value.trim()];

  const matchesEnumValue = (token, enumValue) => {
    if (typeof enumValue === "object") {
      return true;
    }

    if (
      typeof enumValue === "string" &&
      enumValue.startsWith("/") &&
      enumValue.endsWith("/")
    ) {
      return new RegExp(enumValue.slice(1, -1)).test(token);
    }

    return token.toLowerCase() === String(enumValue).toLowerCase();
  };

  const isValid = valuesToTest.every((token) =>
    definition.enum.some((enumValue) => matchesEnumValue(token, enumValue)),
  );

  return isValid ? null : `Valeur invalide "${value}" pour cet attribut.`;
}

function validateHtmlAttributeValue(
  tagName,
  attributeName,
  value,
  useXhtml,
  env,
) {
  if (!value || isDynamicTwigValue(value)) {
    return null;
  }

  if (useXhtml) {
    const customRule = getCustomAttributeValueRule(tagName, attributeName);

    if (customRule) {
      return validateValueAgainstRule(customRule, value);
    }
  }

  const definition = getHtmlAttributeDefinition(tagName, attributeName, env);
  return validateValueAgainstMetadata(definition, value);
}

function validateHtmlWithStandardRules(html, env) {
  const report = env.HTML_VALIDATOR.validateStringSync(html);

  return report.results.flatMap((result) =>
    result.messages.map((message) => {
      const line = message.line || 1;
      const snippet = getLineText(html, line);
      const range = resolveSnippetRangeOnLine(html, line, snippet);

      return {
        line,
        snippet,
        category: "html",
        start: range.start,
        end: range.end,
        message: message.message,
      };
    }),
  );
}

async function validateHtmlRules(html) {
  const env = await getHtmlValidationEnv();
  const issues = [...validateDoctype(html), ...validateHtmlWithStandardRules(html, env)];
  const regex = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?([a-zA-Z][\w:-]*)([^>]*)>/gi;
  let match;
  const useXhtml = hasXhtmlTransitionalDoctype(html);

  while ((match = regex.exec(html)) !== null) {
    const fullTag = match[0];
    const tagName = match[1]?.toLowerCase();
    const line = getLineNumber(html, match.index);

    if (!tagName || fullTag.startsWith("</")) {
      continue;
    }

    const { attributes, duplicates, parsedAttributes } = parseHtmlAttributes(
      match[2] || "",
    );
    const getTagRange = () => ({
      start: match.index,
      end: match.index + fullTag.length,
    });
    const getAttributeRange = (attribute) => ({
      start: match.index + 1 + tagName.length + attribute.start,
      end: match.index + 1 + tagName.length + attribute.end,
    });

    if (
      !isKnownHtmlElement(tagName, env) &&
      !(useXhtml && isCustomOrNamespacedTag(tagName))
    ) {
      const tagRange = getTagRange();
      issues.push({
        category: "tag",
        line,
        snippet: fullTag,
        start: tagRange.start,
        end: tagRange.end,
        message: `La balise "<${tagName}>" n'existe pas dans le profil HTML/XHTML attendu.`,
      });
      continue;
    }

    parsedAttributes.forEach((attribute) => {
      const { name, value } = attribute;

      if (isDynamicAttributeName(name)) {
        return;
      }

      if (useXhtml && isNamespacedAttribute(name)) {
        return;
      }

      if (!isAllowedHtmlAttribute(tagName, name, useXhtml, env)) {
        const range = getAttributeRange(attribute);
        issues.push({
          category: "attribute",
          line,
          snippet: fullTag,
          start: range.start,
          end: range.end,
          message: `L'attribut "${name}" n'existe pas sur la balise "<${tagName}>" dans le profil HTML/XHTML attendu.`,
        });
        return;
      }

      const valueError = validateHtmlAttributeValue(
        tagName,
        name,
        value,
        useXhtml,
        env,
      );

      if (valueError) {
        const range = getAttributeRange(attribute);
        issues.push({
          category: "attribute",
          line,
          snippet: fullTag,
          start: range.start,
          end: range.end,
          message: `L'attribut "${name}" de la balise "<${tagName}>" a une valeur invalide. ${valueError}`,
        });
      }
    });

    duplicates.forEach((duplicate) => {
      const attribute = parsedAttributes.find(
        (parsedAttribute) =>
          parsedAttribute.name === duplicate.name &&
          parsedAttribute.value === duplicate.value,
      );
      const range = attribute ? getAttributeRange(attribute) : getTagRange();

      issues.push({
        category: "attribute",
        line,
        snippet: fullTag,
        start: range.start,
        end: range.end,
        message: `L'attribut "${duplicate.name}" est defini plusieurs fois sur la meme balise.`,
      });
    });

    if (tagName === "img") {
      const src = normalizeUrlValue(attributes.src || "");
      const srcAttribute = parsedAttributes.find(
        (attribute) => attribute.name === "src",
      );
      const tagRange = getTagRange();

      if (!src) {
        issues.push({
          category: "image",
          line,
          snippet: fullTag,
          start: tagRange.start,
          end: tagRange.end,
          message: `L'image doit avoir un attribut "src".`,
        });
      } else if (!isDynamicTwigValue(src) && !ABSOLUTE_IMAGE_SRC_REGEX.test(src)) {
        const range = srcAttribute ? getAttributeRange(srcAttribute) : tagRange;
        issues.push({
          category: "image",
          line,
          snippet: fullTag,
          start: range.start,
          end: range.end,
          message: `Le "src" de l'image doit etre absolu, pas relatif.`,
        });
      }

      if (!Object.prototype.hasOwnProperty.call(attributes, "alt")) {
        issues.push({
          category: "image",
          line,
          snippet: fullTag,
          start: tagRange.start,
          end: tagRange.end,
          message: `L'image doit avoir un attribut "alt".`,
        });
      }
    }

    if (tagName === "a") {
      const href = normalizeUrlValue(attributes.href || "");
      const hrefAttribute = parsedAttributes.find(
        (attribute) => attribute.name === "href",
      );
      const tagRange = getTagRange();

      if (!Object.prototype.hasOwnProperty.call(attributes, "href")) {
        issues.push({
          category: "link",
          line,
          snippet: fullTag,
          start: tagRange.start,
          end: tagRange.end,
          message: `Le lien "<a>" doit avoir un attribut "href".`,
        });
      } else if (!href || href === "#") {
        const range = hrefAttribute ? getAttributeRange(hrefAttribute) : tagRange;
        issues.push({
          category: "link",
          line,
          snippet: fullTag,
          start: range.start,
          end: range.end,
          message: `Le lien "<a>" ne doit pas etre vide.`,
        });
      } else if (
        !isDynamicTwigValue(href) &&
        !SPECIAL_LINK_PROTOCOLS.some((protocol) =>
          href.toLowerCase().startsWith(protocol),
        ) &&
        !HTTPS_LINK_REGEX.test(href)
      ) {
        const range = hrefAttribute ? getAttributeRange(hrefAttribute) : tagRange;
        issues.push({
          category: "link",
          line,
          snippet: fullTag,
          start: range.start,
          end: range.end,
          message: `Le lien doit utiliser HTTPS.`,
        });
      }
    }
  }

  return issues;
}

function getIgnoredSpecialCharacterRanges(html) {
  const ranges = [];
  const tagRegex = /<([a-zA-Z][\w:-]*)([^>]*)>/g;
  let tagMatch;

  while ((tagMatch = tagRegex.exec(html)) !== null) {
    const attributesSource = tagMatch[2] || "";
    const attributeRegex =
      /data-subject-email\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
    const attributeMatch = attributeRegex.exec(attributesSource);

    if (!attributeMatch) {
      continue;
    }

    const attributeValue =
      attributeMatch[1] ?? attributeMatch[2] ?? attributeMatch[3] ?? "";
    const valueIndexInAttribute = attributeMatch[0].indexOf(attributeValue);

    if (valueIndexInAttribute === -1) {
      continue;
    }

    const absoluteStart =
      tagMatch.index +
      tagMatch[0].indexOf(attributesSource) +
      attributeMatch.index +
      valueIndexInAttribute;

    ranges.push({
      start: absoluteStart,
      end: absoluteStart + attributeValue.length,
    });
  }

  return ranges;
}

function isIndexInRanges(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function getWordAroundIndex(text, index) {
  const isWordBoundary = (character) =>
    !character || /[\s<>"'=\/(){}[\],;:!?]/.test(character);
  let start = index;
  let end = index + 1;

  while (start > 0 && !isWordBoundary(text[start - 1])) {
    start -= 1;
  }

  while (end < text.length && !isWordBoundary(text[end])) {
    end += 1;
  }

  return text.slice(start, end);
}

function getWordRangeAroundIndex(text, index) {
  const isWordBoundary = (character) =>
    !character || /[\s<>"'=\/(){}[\],;:!?]/.test(character);
  let start = index;
  let end = index + 1;

  while (start > 0 && !isWordBoundary(text[start - 1])) {
    start -= 1;
  }

  while (end < text.length && !isWordBoundary(text[end])) {
    end += 1;
  }

  return { start, end };
}

function validateEncodedSpecialCharacters(html) {
  const issues = [];
  const ignoredRanges = getIgnoredSpecialCharacterRanges(html);
  let index = 0;

  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const commentEnd = html.indexOf("-->", index + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    if (html.startsWith("{{", index) || html.startsWith("{%", index)) {
      const endMarker = html.startsWith("{{", index) ? "}}" : "%}";
      const twigEnd = html.indexOf(endMarker, index + 2);
      index = twigEnd === -1 ? html.length : twigEnd + 2;
      continue;
    }

    if (html[index] === "&") {
      const entityEnd = html.indexOf(";", index + 1);

      if (entityEnd !== -1) {
        index = entityEnd + 1;
        continue;
      }
    }

    if (
      NON_ASCII_CHAR_REGEX.test(html[index]) &&
      !isIndexInRanges(index, ignoredRanges)
    ) {
      const word = getWordAroundIndex(html, index);
      const wordRange = getWordRangeAroundIndex(html, index);

      issues.push({
        category: "encoding",
        line: getLineNumber(html, index),
        snippet: word || html[index],
        start: word ? wordRange.start : index,
        end: word ? wordRange.end : index + 1,
        message:
          "Le caractere special doit etre encode en entite HTML, sauf dans data-subject-email.",
      });
    }

    index += 1;
  }

  return issues;
}

function sumRawCounts(entry) {
  if (!entry) {
    return 0;
  }

  return Object.values(entry.raws).reduce((total, count) => total + count, 0);
}

function getConditionBalance(data) {
  const ifTotal = sumRawCounts(data.if);
  const endifTotal = sumRawCounts(data.endif);
  const forTotal = sumRawCounts(data.for);
  const endforTotal = sumRawCounts(data.endfor);
  const isIfBalanced = ifTotal === endifTotal;
  const isForBalanced = forTotal === endforTotal;

  return {
    ifTotal,
    endifTotal,
    forTotal,
    endforTotal,
    isIfBalanced,
    isForBalanced,
    isBalanced: isIfBalanced && isForBalanced,
  };
}

async function buildValidationState(emailA, emailB, isDoubleView) {
  const safeEmailA = emailA || "";
  const safeEmailB = isDoubleView ? emailB || "" : "";

  if (!safeEmailA && !safeEmailB) {
    return createEmptyValidationState();
  }

  const [htmlValidationA, htmlValidationB] = await Promise.all([
    safeEmailA
      ? validateHtmlRules(safeEmailA).then((issues) => [
          ...issues,
          ...validateEncodedSpecialCharacters(safeEmailA),
        ])
      : Promise.resolve([]),
    safeEmailB
      ? validateHtmlRules(safeEmailB).then((issues) => [
          ...issues,
          ...validateEncodedSpecialCharacters(safeEmailB),
        ])
      : Promise.resolve([]),
  ]);

  const varsA = countTwigVariables(safeEmailA);
  const varsB = countTwigVariables(safeEmailB);
  const condA = countTwigConditions(safeEmailA);
  const condB = countTwigConditions(safeEmailB);

  return {
    varsA,
    varsB,
    condA,
    condB,
    validationA: validateTwigControlStructures(safeEmailA),
    validationB: validateTwigControlStructures(safeEmailB),
    htmlValidationA,
    htmlValidationB,
    conditionBalanceA: getConditionBalance(condA),
    conditionBalanceB: getConditionBalance(condB),
  };
}

self.onmessage = (event) => {
  void (async () => {
    const { requestId, emailA, emailB, isDoubleView } = event.data;

    try {
      const result = await buildValidationState(emailA, emailB, isDoubleView);
      self.postMessage({ requestId, result });
    } catch (error) {
      self.postMessage({
        requestId,
        result: createEmptyValidationState(),
        error: error instanceof Error ? error.message : "Validation error",
      });
    }
  })();
};

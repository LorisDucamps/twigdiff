import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import twigGuardLogo from "./assets/twigguard-logo.svg";

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
const ISSUE_CATEGORY_META = {
  twig: {
    label: "Twig",
    badge: "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200",
  },
  doctype: {
    label: "Doctype",
    badge: "bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200",
  },
  html: {
    label: "HTML",
    badge: "bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200",
  },
  tag: {
    label: "Balises",
    badge: "bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200",
  },
  attribute: {
    label: "Attributs",
    badge: "bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200",
  },
  image: {
    label: "Images",
    badge: "bg-cyan-100 text-cyan-700 ring-1 ring-inset ring-cyan-200",
  },
  link: {
    label: "Liens",
    badge: "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200",
  },
  encoding: {
    label: "Encodage",
    badge: "bg-fuchsia-100 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200",
  },
};
const ISSUE_FILTER_ORDER = [
  "twig",
  "doctype",
  "html",
  "tag",
  "attribute",
  "image",
  "link",
  "encoding",
];
const EMPTY_CONDITION_BALANCE = {
  ifTotal: 0,
  endifTotal: 0,
  forTotal: 0,
  endforTotal: 0,
  isIfBalanced: true,
  isForBalanced: true,
  isBalanced: true,
};
const EMPTY_VALIDATION_STATE = {
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

function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * {{ ... }}
 */
function countTwigVariables(html) {
  const regex = /{{\s*([\s\S]*?)\s*}}/g;
  return extractTwig(regex, html, (raw) => raw.split("|")[0].trim());
}

/**
 * {% if ... %}, {% for ... %}, etc.
 */
function countTwigConditions(html) {
  const regex = /{%\s*([\s\S]*?)\s*%}/g;
  return extractTwig(regex, html, (raw) => {
    // clé logique = mot-clé principal
    return raw.split(/\s+/)[0]; // if, for, elseif, endif...
  });
}

/**
 * Extracteur générique
 */
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
      nameStart: match.index,
      nameEnd: match.index + match[1].length,
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
    return {
      start: lineStart,
      end: safeLineEnd,
    };
  }

  const trimmedSnippet = snippet.trim();
  const directIndex = lineText.indexOf(trimmedSnippet);

  if (directIndex !== -1) {
    return {
      start: lineStart + directIndex,
      end: lineStart + directIndex + trimmedSnippet.length,
    };
  }

  return {
    start: lineStart,
    end: safeLineEnd,
  };
}

function validateDoctype(html) {
  const regex = /<!DOCTYPE[\s\S]*?>/i;
  const match = regex.exec(html);

  if (!match) {
    return [];
  }

  if (XHTML_TRANSITIONAL_DOCTYPE_REGEX.test(match[0])) {
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

function isKnownHtmlElement(tagName) {
  return Object.prototype.hasOwnProperty.call(html5Elements, tagName);
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

function isAllowedHtmlAttribute(
  tagName,
  attributeName,
  useXhtmlTransitionalProfile,
) {
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

  if (useXhtmlTransitionalProfile) {
    const transitionalAttributes =
      XHTML_TRANSITIONAL_ALLOWED_ATTRIBUTES[tagName];

    if (transitionalAttributes?.has(attributeName)) {
      return true;
    }
  }

  if (HTML_GLOBAL_ATTRIBUTES.has(attributeName)) {
    return true;
  }

  const elementAttributes = html5Elements[tagName]?.attributes || {};
  return Object.prototype.hasOwnProperty.call(elementAttributes, attributeName);
}

function getHtmlAttributeDefinition(tagName, attributeName) {
  const elementAttributes = html5Elements[tagName]?.attributes || {};

  if (Object.prototype.hasOwnProperty.call(elementAttributes, attributeName)) {
    return elementAttributes[attributeName];
  }

  const globalAttributes = html5Elements["*"]?.attributes || {};
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

  if (rule.type === "url") {
    if (!isUrlValue(normalizedValue)) {
      return `Valeur invalide "${value}". Une URL ou un chemin compatible email est attendu.`;
    }
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
      const pattern = enumValue.slice(1, -1);
      return new RegExp(pattern).test(token);
    }

    return token.toLowerCase() === String(enumValue).toLowerCase();
  };

  const isValid = valuesToTest.every((token) =>
    definition.enum.some((enumValue) => matchesEnumValue(token, enumValue)),
  );

  if (!isValid) {
    return `Valeur invalide "${value}" pour cet attribut.`;
  }

  return null;
}

function validateHtmlAttributeValue(
  tagName,
  attributeName,
  value,
  useXhtmlTransitionalProfile,
) {
  if (!value || isDynamicTwigValue(value)) {
    return null;
  }

  if (useXhtmlTransitionalProfile) {
    const customRule = getCustomAttributeValueRule(tagName, attributeName);

    if (customRule) {
      return validateValueAgainstRule(customRule, value);
    }
  }

  const definition = getHtmlAttributeDefinition(tagName, attributeName);
  return validateValueAgainstMetadata(definition, value);
}

function validateHtmlWithStandardRules(html) {
  const report = HTML_VALIDATOR.validateStringSync(html);

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

function validateHtmlRules(html) {
  const issues = [...validateDoctype(html), ...validateHtmlWithStandardRules(html)];
  const regex = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?([a-zA-Z][\w:-]*)([^>]*)>/gi;
  let match;
  const useXhtmlTransitionalProfile = hasXhtmlTransitionalDoctype(html);

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
      !isKnownHtmlElement(tagName) &&
      !(useXhtmlTransitionalProfile && isCustomOrNamespacedTag(tagName))
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

      if (useXhtmlTransitionalProfile && isNamespacedAttribute(name)) {
        return;
      }

      if (!isAllowedHtmlAttribute(tagName, name, useXhtmlTransitionalProfile)) {
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
        useXhtmlTransitionalProfile,
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

    const attributeValue = attributeMatch[1] ?? attributeMatch[2] ?? attributeMatch[3] ?? "";
    const valueIndexInAttribute = attributeMatch[0].indexOf(attributeValue);

    if (valueIndexInAttribute === -1) {
      continue;
    }

    const absoluteStart =
      tagMatch.index + tagMatch[0].indexOf(attributesSource) + attributeMatch.index + valueIndexInAttribute;

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

function getBalanceCellStyle(isBalanced) {
  return {
    background: isBalanced ? "#e5ffe5" : "#ffe5e5",
    padding: 8,
  };
}

function getIssuePanelClasses(hasIssues, accent = "rose") {
  if (!hasIssues) {
    return "border-emerald-200 bg-emerald-50/80";
  }

  if (accent === "amber") {
    return "border-amber-200 bg-amber-50/80";
  }

  return "border-rose-200 bg-rose-50/80";
}

function getCountBadgeClasses(hasIssues, accent = "rose") {
  if (!hasIssues) {
    return "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200";
  }

  if (accent === "amber") {
    return "bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200";
  }

  return "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200";
}

function getIssueCategoryMeta(category) {
  return ISSUE_CATEGORY_META[category] || ISSUE_CATEGORY_META.html;
}

function getIssueSnippet(issue) {
  if (issue.tag) {
    return `{% ${issue.tag} %}`;
  }

  return issue.snippet || "";
}

function findSnippetNearIndex(text, snippet, preferredIndex = 0) {
  if (!snippet) {
    return -1;
  }

  if (preferredIndex >= 0 && text.slice(preferredIndex, preferredIndex + snippet.length) === snippet) {
    return preferredIndex;
  }

  const directIndex = text.indexOf(snippet, Math.max(0, preferredIndex - snippet.length));

  if (directIndex !== -1) {
    return directIndex;
  }

  return text.indexOf(snippet);
}

function resolveIssueSelectionRange(text, issue) {
  const snippet = getIssueSnippet(issue);

  if (snippet) {
    const lineStart = getLineStartIndex(text, issue.line || 1);
    const lineEndIndex = text.indexOf("\n", lineStart);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const snippetIndexOnLine = text.indexOf(snippet, lineStart);

    if (snippetIndexOnLine !== -1 && snippetIndexOnLine <= lineEnd) {
      return {
        start: snippetIndexOnLine,
        end: snippetIndexOnLine + snippet.length,
      };
    }

    const anchorIndex =
      typeof issue.start === "number" ? issue.start : lineStart;
    const snippetIndex = findSnippetNearIndex(text, snippet, anchorIndex);

    if (snippetIndex !== -1) {
      return {
        start: snippetIndex,
        end: snippetIndex + snippet.length,
      };
    }
  }

  const fallbackRange = getLineSelectionRange(text, issue.line);

  return clampSelectionRange(
    text,
    typeof issue.start === "number" ? issue.start : fallbackRange.start,
    typeof issue.end === "number" ? issue.end : fallbackRange.end,
  );
}

function filterIssuesByCategory(issues, activeCategory) {
  if (activeCategory === "all") {
    return issues;
  }

  return issues.filter((issue) => issue.category === activeCategory);
}

function getIssueCountLabel(visibleCount, totalCount) {
  if (visibleCount === totalCount) {
    return `${totalCount} erreur(s)`;
  }

  return `${visibleCount} / ${totalCount} erreur(s)`;
}

function clampSelectionRange(text, start, end) {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));

  return {
    start: safeStart,
    end: safeEnd,
  };
}

function getLineSelectionRange(text, lineNumber) {
  if (lineNumber <= 1) {
    const firstBreak = text.indexOf("\n");

    return {
      start: 0,
      end: firstBreak === -1 ? text.length : firstBreak,
    };
  }

  let currentLine = 1;
  let start = 0;

  while (currentLine < lineNumber && start < text.length) {
    const nextBreak = text.indexOf("\n", start);

    if (nextBreak === -1) {
      return {
        start: text.length,
        end: text.length,
      };
    }

    start = nextBreak + 1;
    currentLine += 1;
  }

  const end = text.indexOf("\n", start);

  return {
    start,
    end: end === -1 ? text.length : end,
  };
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function renderTextareaHighlightOverlay(
  value,
  activeFocus,
  mirrorRef,
  markerRef,
) {
  if (!activeFocus) {
    return null;
  }

  const { start, end } = clampSelectionRange(value, activeFocus.start, activeFocus.end);
  const before = value.slice(0, start);
  const highlighted = value.slice(start, end);
  const after = value.slice(end);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.5rem]"
    >
      <pre
        ref={mirrorRef}
        className="min-h-[26rem] min-w-full w-max px-4 py-4 font-mono text-sm leading-6 text-slate-100"
        style={{ transform: "translate(0px, 0px)", willChange: "transform" }}
      >
        <span>{before}</span>
        <mark
          ref={markerRef}
          className="rounded bg-blue-300/70 text-slate-950 shadow-[0_0_0_1px_rgba(96,165,250,0.55)]"
        >
          {highlighted || " "}
        </mark>
        <span>{after}</span>
      </pre>
    </div>
  );
}

function renderRows(keys, dataA, dataB, options = {}) {
  const { showTotals = false, mode = "double", balanceA, balanceB } = options;
  const isComparison = mode === "double";

  return keys.map((key) => {
    const a = dataA[key];
    const b = dataB[key];

    const isDifferent =
      isComparison &&
      (!a || !b || JSON.stringify(a.raws) !== JSON.stringify(b.raws));

    return (
      <tr
        key={key}
        className="transition-colors"
        style={{
          background: isComparison
            ? isDifferent
              ? "#ffe5e5"
              : "#e5ffe5"
            : undefined,
          verticalAlign: "top",
        }}
      >
        <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-800">
          <strong>{key}</strong>
        </td>

        <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-700">
          {a
            ? Object.entries(a.raws).map(([expr, count]) => (
                <div key={expr}>
                  {expr} × {count}
                </div>
              ))
            : "—"}
        </td>

        {isComparison ? (
          <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-700">
            {b
              ? Object.entries(b.raws).map(([expr, count]) => (
                  <div key={expr}>
                    {expr} × {count}
                  </div>
                ))
              : "—"}
          </td>
        ) : null}

        {showTotals ? (
          <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-700">
            {isComparison && key === "if" ? (
              <>
                <div style={getBalanceCellStyle(balanceA.isBalanced)}>
                  If total A: {balanceA.ifTotal}
                </div>
                <div style={{ height: 8 }} />
                <div style={getBalanceCellStyle(balanceB.isBalanced)}>
                  If total B: {balanceB.ifTotal}
                </div>
              </>
            ) : null}

            {isComparison && key === "endif" ? (
              <>
                <div style={getBalanceCellStyle(balanceA.isIfBalanced)}>
                  Endif total A: {balanceA.endifTotal}
                </div>
                <div style={{ height: 8 }} />
                <div style={getBalanceCellStyle(balanceB.isIfBalanced)}>
                  Endif total B: {balanceB.endifTotal}
                </div>
              </>
            ) : null}

            {isComparison && key === "for" ? (
              <>
                <div style={getBalanceCellStyle(balanceA.isForBalanced)}>
                  For total A: {balanceA.forTotal}
                </div>
                <div style={{ height: 8 }} />
                <div style={getBalanceCellStyle(balanceB.isForBalanced)}>
                  For total B: {balanceB.forTotal}
                </div>
              </>
            ) : null}

            {isComparison && key === "endfor" ? (
              <>
                <div style={getBalanceCellStyle(balanceA.isForBalanced)}>
                  Endfor total A: {balanceA.endforTotal}
                </div>
                <div style={{ height: 8 }} />
                <div style={getBalanceCellStyle(balanceB.isForBalanced)}>
                  Endfor total B: {balanceB.endforTotal}
                </div>
              </>
            ) : null}

            {!isComparison && key === "if" ? (
              <div style={getBalanceCellStyle(balanceA.isIfBalanced)}>
                If total: {balanceA.ifTotal}
              </div>
            ) : null}

            {!isComparison && key === "endif" ? (
              <div style={getBalanceCellStyle(balanceA.isIfBalanced)}>
                Endif total: {balanceA.endifTotal}
              </div>
            ) : null}

            {!isComparison && key === "for" ? (
              <div style={getBalanceCellStyle(balanceA.isForBalanced)}>
                For total: {balanceA.forTotal}
              </div>
            ) : null}

            {!isComparison && key === "endfor" ? (
              <div style={getBalanceCellStyle(balanceA.isForBalanced)}>
                Endfor total: {balanceA.endforTotal}
              </div>
            ) : null}

            {key !== "if" &&
            key !== "endif" &&
            key !== "for" &&
            key !== "endfor"
              ? "—"
              : null}
          </td>
        ) : null}
      </tr>
    );
  });
}

function renderIssueList(issues, options = {}) {
  const { emptyMessage, onSelectLine } = options;

  if (!issues.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        {emptyMessage}
      </div>
    );
  }

  return issues.map((issue, index) => (
    <button
      type="button"
      key={`${issue.line}-${issue.category}-${index}`}
      onClick={() => onSelectLine?.(issue)}
      className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">
          Ligne {issue.line}
        </div>
        <div
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getIssueCategoryMeta(issue.category).badge}`}
        >
          {getIssueCategoryMeta(issue.category).label}
        </div>
      </div>
      <div className="mt-1 text-sm text-slate-700">{issue.message}</div>
      <div className="mt-2 rounded-xl bg-slate-950 px-3 py-2 text-xs text-slate-100">
        {getIssueSnippet(issue)}
      </div>
      <div className="mt-2 text-xs font-medium text-slate-500">
        Cliquer pour aller a la ligne
      </div>
    </button>
  ));
}

export default function App() {
  const [emailA, setEmailA] = useState("");
  const [emailB, setEmailB] = useState("");
  const [viewMode, setViewMode] = useState("single");
  const [activeIssueFilter, setActiveIssueFilter] = useState("all");
  const [activeFocus, setActiveFocus] = useState(null);
  const [validationState, setValidationState] = useState(EMPTY_VALIDATION_STATE);
  const [isValidationPending, setIsValidationPending] = useState(false);
  const textareaARef = useRef(null);
  const textareaBRef = useRef(null);
  const editorARef = useRef(null);
  const editorBRef = useRef(null);
  const mirrorARef = useRef(null);
  const mirrorBRef = useRef(null);
  const highlightARef = useRef(null);
  const highlightBRef = useRef(null);
  const validationWorkerRef = useRef(null);
  const validationRequestIdRef = useRef(0);
  const validationResponseIdRef = useRef(0);
  const isDoubleView = viewMode === "double";
  const debouncedEmailA = useDebouncedValue(emailA, 180);
  const debouncedEmailB = useDebouncedValue(emailB, 180);
  const {
    varsA,
    varsB,
    condA,
    condB,
    validationA,
    validationB,
    htmlValidationA,
    htmlValidationB,
    conditionBalanceA,
    conditionBalanceB,
  } = validationState;
  const scopedTwigIssuesA = validationA.map((issue) => ({
    ...issue,
    source: "A",
    scope: "Twig",
  }));
  const scopedTwigIssuesB = validationB.map((issue) => ({
    ...issue,
    source: "B",
    scope: "Twig",
  }));
  const scopedHtmlIssuesA = htmlValidationA.map((issue) => ({
    ...issue,
    source: "A",
    scope: "HTML",
  }));
  const scopedHtmlIssuesB = htmlValidationB.map((issue) => ({
    ...issue,
    source: "B",
    scope: "HTML",
  }));
  const allIssues = isDoubleView
    ? [
        ...scopedTwigIssuesA,
        ...scopedHtmlIssuesA,
        ...scopedTwigIssuesB,
        ...scopedHtmlIssuesB,
      ]
    : [...scopedTwigIssuesA, ...scopedHtmlIssuesA];
  const filteredValidationA = filterIssuesByCategory(validationA, activeIssueFilter);
  const filteredValidationB = filterIssuesByCategory(validationB, activeIssueFilter);
  const filteredHtmlValidationA = filterIssuesByCategory(
    htmlValidationA,
    activeIssueFilter,
  );
  const filteredHtmlValidationB = filterIssuesByCategory(
    htmlValidationB,
    activeIssueFilter,
  );
  const issueFilterOptions = [
    {
      id: "all",
      label: "Tout",
      count: allIssues.length,
    },
    ...ISSUE_FILTER_ORDER.map((category) => ({
      id: category,
      label: getIssueCategoryMeta(category).label,
      count: allIssues.filter((issue) => issue.category === category).length,
    })),
  ];

  const varKeys = isDoubleView
    ? Array.from(new Set([...Object.keys(varsA), ...Object.keys(varsB)]))
    : Object.keys(varsA);

  const condKeys = isDoubleView
    ? Array.from(new Set([...Object.keys(condA), ...Object.keys(condB)]))
    : Object.keys(condA);
  const summaryCards = isDoubleView
    ? [
        {
          label: "Twig A",
          value: validationA.length,
          suffix: "erreur(s)",
          tone: getCountBadgeClasses(validationA.length > 0),
        },
        {
          label: "HTML A",
          value: htmlValidationA.length,
          suffix: "erreur(s)",
          tone: getCountBadgeClasses(htmlValidationA.length > 0, "amber"),
        },
        {
          label: "Twig B",
          value: validationB.length,
          suffix: "erreur(s)",
          tone: getCountBadgeClasses(validationB.length > 0),
        },
        {
          label: "HTML B",
          value: htmlValidationB.length,
          suffix: "erreur(s)",
          tone: getCountBadgeClasses(htmlValidationB.length > 0, "amber"),
        },
        {
          label: "Validation",
          value: isValidationPending ? "..." : "OK",
          suffix: isValidationPending ? "analyse" : "a jour",
          tone: isValidationPending
            ? "bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200"
            : "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200",
        },
      ]
    : [
        {
          label: "Twig",
          value: validationA.length,
          suffix: "erreur(s)",
          tone: getCountBadgeClasses(validationA.length > 0),
        },
        {
          label: "HTML",
          value: htmlValidationA.length,
          suffix: "erreur(s)",
          tone: getCountBadgeClasses(htmlValidationA.length > 0, "amber"),
        },
        {
          label: "Equilibre Twig",
          value: conditionBalanceA.isBalanced ? "OK" : "KO",
          suffix: `${conditionBalanceA.ifTotal}/${conditionBalanceA.endifTotal} if | ${conditionBalanceA.forTotal}/${conditionBalanceA.endforTotal} for`,
          tone: conditionBalanceA.isBalanced
            ? "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200"
            : "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200",
        },
        {
          label: "Validation",
          value: isValidationPending ? "..." : "OK",
          suffix: isValidationPending ? "analyse" : "a jour",
          tone: isValidationPending
            ? "bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200"
            : "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200",
        },
      ];
  const syncMirrorScroll = (target, scrollTop, scrollLeft) => {
    const mirror = target === "B" ? mirrorBRef.current : mirrorARef.current;

    if (!mirror) {
      return;
    }

    mirror.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  };

  useEffect(() => {
    const validationWorker = new Worker(
      new URL("./workers/validationWorker.js", import.meta.url),
      { type: "module" },
    );

    validationWorkerRef.current = validationWorker;

    validationWorker.onmessage = (event) => {
      const { requestId, result } = event.data;

      if (requestId < validationResponseIdRef.current) {
        return;
      }

      validationResponseIdRef.current = requestId;

      startTransition(() => {
        setValidationState(result || EMPTY_VALIDATION_STATE);
        setIsValidationPending(false);
      });
    };

    validationWorker.onerror = () => {
      setIsValidationPending(false);
    };

    return () => {
      validationWorker.terminate();
      validationWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const validationWorker = validationWorkerRef.current;
    const emailForB = isDoubleView ? debouncedEmailB : "";

    if (!validationWorker) {
      return;
    }

    const requestId = validationRequestIdRef.current + 1;
    validationRequestIdRef.current = requestId;

    if (!debouncedEmailA && !emailForB) {
      validationResponseIdRef.current = requestId;

      startTransition(() => {
        setValidationState(EMPTY_VALIDATION_STATE);
        setIsValidationPending(false);
      });
      return;
    }

    setIsValidationPending(true);
    validationWorker.postMessage({
      requestId,
      emailA: debouncedEmailA,
      emailB: emailForB,
      isDoubleView,
    });
  }, [debouncedEmailA, debouncedEmailB, isDoubleView]);

  const focusIssue = (target, issue) => {
    const textarea = target === "B" ? textareaBRef.current : textareaARef.current;
    const content = textarea?.value || "";

    if (!textarea) {
      return;
    }

    const range = resolveIssueSelectionRange(content, issue);
    const lineNumber = issue.line || getLineNumber(content, range.start);

    setActiveFocus({
      target,
      line: lineNumber,
      start: range.start,
      end: range.end,
      label: getIssueCategoryMeta(issue.category).label,
    });
  };

  useLayoutEffect(() => {
    if (!activeFocus) {
      return;
    }

    const textarea =
      activeFocus.target === "B" ? textareaBRef.current : textareaARef.current;
    const editor = activeFocus.target === "B" ? editorBRef.current : editorARef.current;
    const highlight =
      activeFocus.target === "B" ? highlightBRef.current : highlightARef.current;

    if (!textarea || !editor) {
      return;
    }

    editor.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    const applySelection = () => {
      textarea.focus();
      textarea.setSelectionRange(activeFocus.start, activeFocus.end);

      if (highlight) {
        const targetTop = Math.max(
          0,
          highlight.offsetTop - textarea.clientHeight * 0.35,
        );
        const targetLeft = Math.max(0, highlight.offsetLeft - 48);
        textarea.scrollTop = targetTop;
        textarea.scrollLeft = targetLeft;
        syncMirrorScroll(activeFocus.target, targetTop, targetLeft);
      }
    };

    requestAnimationFrame(applySelection);
  }, [activeFocus]);

  useLayoutEffect(() => {
    if (textareaARef.current) {
      syncMirrorScroll(
        "A",
        textareaARef.current.scrollTop,
        textareaARef.current.scrollLeft,
      );
    }

    if (textareaBRef.current) {
      syncMirrorScroll(
        "B",
        textareaBRef.current.scrollTop,
        textareaBRef.current.scrollLeft,
      );
    }
  }, [emailA, emailB, activeFocus, isDoubleView]);

  const buildReportPayload = () => {
    const currentDate = new Date().toISOString();
    const visibleIssues = allIssues.filter((issue) =>
      activeIssueFilter === "all" ? true : issue.category === activeIssueFilter,
    );

    return {
      generatedAt: currentDate,
      project: "TwigGuard",
      viewMode,
      filter:
        activeIssueFilter === "all"
          ? "Toutes les categories"
          : getIssueCategoryMeta(activeIssueFilter).label,
      summary: {
        emailA: {
          twigErrors: validationA.length,
          htmlErrors: htmlValidationA.length,
          balance: conditionBalanceA,
        },
        ...(isDoubleView
          ? {
              emailB: {
                twigErrors: validationB.length,
                htmlErrors: htmlValidationB.length,
                balance: conditionBalanceB,
              },
            }
          : {}),
      },
      issues: visibleIssues.map((issue) => ({
        source: isDoubleView ? `Email ${issue.source}` : "Email",
        scope: issue.scope,
        category: getIssueCategoryMeta(issue.category).label,
        line: issue.line,
        message: issue.message,
        snippet: getIssueSnippet(issue),
      })),
    };
  };

  const exportReport = (format) => {
    const payload = buildReportPayload();
    const timestamp = payload.generatedAt.replace(/[:.]/g, "-");

    if (format === "json") {
      downloadFile(
        `${JSON.stringify(payload, null, 2)}\n`,
        `twigguard-report-${timestamp}.json`,
        "application/json",
      );
      return;
    }

    const lines = [
      "TwigGuard",
      `Genere le: ${payload.generatedAt}`,
      `Vue: ${payload.viewMode === "double" ? "double" : "simple"}`,
      `Filtre: ${payload.filter}`,
      "",
      "Resume",
      `Email A - Twig: ${validationA.length} erreur(s)`,
      `Email A - HTML: ${htmlValidationA.length} erreur(s)`,
      `Email A - Equilibre: ${conditionBalanceA.isBalanced ? "OK" : "KO"} (${conditionBalanceA.ifTotal}/${conditionBalanceA.endifTotal} if, ${conditionBalanceA.forTotal}/${conditionBalanceA.endforTotal} for)`,
    ];

    if (isDoubleView) {
      lines.push(
        `Email B - Twig: ${validationB.length} erreur(s)`,
        `Email B - HTML: ${htmlValidationB.length} erreur(s)`,
        `Email B - Equilibre: ${conditionBalanceB.isBalanced ? "OK" : "KO"} (${conditionBalanceB.ifTotal}/${conditionBalanceB.endifTotal} if, ${conditionBalanceB.forTotal}/${conditionBalanceB.endforTotal} for)`,
      );
    }

    lines.push("", "Erreurs");

    if (!payload.issues.length) {
      lines.push("Aucune erreur pour le filtre courant.");
    } else {
      payload.issues.forEach((issue, index) => {
        lines.push(
          `${index + 1}. [${issue.source}] [${issue.scope}] [${issue.category}] Ligne ${issue.line}`,
          issue.message,
          issue.snippet ? `Snippet: ${issue.snippet}` : "Snippet: —",
          "",
        );
      });
    }

    downloadFile(
      `${lines.join("\n")}\n`,
      `twigguard-report-${timestamp}.txt`,
      "text/plain;charset=utf-8",
    );
  };

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="grid gap-6 border-b border-slate-200/80 px-6 py-6 lg:grid-cols-[1.4fr,auto] lg:px-8">
            <div className="flex items-start gap-4">
              <img
                src={twigGuardLogo}
                alt="TwigGuard"
                className="h-16 w-16 shrink-0 rounded-3xl border border-slate-200/80 bg-slate-950/95 p-2 shadow-lg shadow-slate-950/10"
              />
              <div>
                <div className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-50">
                  TwigGuard
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Validation Twig + XHTML pour emails legacy
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  Controle la structure Twig, le XHTML emailing, les attributs
                  legacy et les equilibres de blocs avec une interface rapide,
                  lisible et orientee validation.
                </p>
              </div>
            </div>

            <div className="flex items-start justify-start lg:justify-end">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setViewMode("single")}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    !isDoubleView
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Vue simple
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("double")}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    isDoubleView
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Vue double
                </button>
              </div>
            </div>
          </div>

          <div className={`grid gap-4 px-6 py-6 ${isDoubleView ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-4"} lg:px-8`}>
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {card.label}
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <div className="text-3xl font-semibold tracking-tight text-slate-950">
                    {card.value}
                  </div>
                  <div
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${card.tone}`}
                  >
                    {card.suffix}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          className={`grid gap-6 ${isDoubleView ? "xl:grid-cols-2" : "grid-cols-1"}`}
        >
          <div
            ref={editorARef}
            className={`rounded-[2rem] border bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur transition ${
              activeFocus?.target === "A"
                ? "border-blue-400 ring-4 ring-blue-100"
                : "border-slate-200"
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {isDoubleView ? "Email actuellement en PROD" : "Email HTML"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Colle ici le HTML a verifier.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {emailA.length.toLocaleString("fr-FR")} caracteres
              </div>
            </div>
            {activeFocus?.target === "A" ? (
              <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Zone ciblee: ligne {activeFocus.line}, caracteres {activeFocus.start + 1} a {activeFocus.end}
              </div>
            ) : null}
            <div className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950 shadow-inner">
              {renderTextareaHighlightOverlay(
                emailA,
                activeFocus?.target === "A" ? activeFocus : null,
                mirrorARef,
                highlightARef,
              )}
              <textarea
                ref={textareaARef}
                placeholder="Colle ici ton email HTML"
                value={emailA}
                onChange={(e) => {
                  if (activeFocus?.target === "A") {
                    setActiveFocus(null);
                  }
                  setEmailA(e.target.value);
                  syncMirrorScroll("A", e.target.scrollTop, e.target.scrollLeft);
                }}
                onScroll={(e) => {
                  if (activeFocus?.target === "A") {
                    syncMirrorScroll("A", e.target.scrollTop, e.target.scrollLeft);
                  }
                }}
                spellCheck={false}
                wrap="off"
                rows={18}
                className={`relative z-10 min-h-[26rem] w-full resize-y rounded-[1.5rem] bg-transparent px-4 py-4 font-mono text-sm leading-6 caret-slate-100 outline-none transition placeholder:text-slate-500 focus:ring-4 focus:ring-blue-100 ${
                  activeFocus?.target === "A" ? "text-transparent" : "text-slate-100"
                }`}
              />
            </div>
          </div>

          {isDoubleView ? (
            <div
              ref={editorBRef}
              className={`rounded-[2rem] border bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur transition ${
                activeFocus?.target === "B"
                  ? "border-blue-400 ring-4 ring-blue-100"
                  : "border-slate-200"
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Email sortie de PULSE
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Colle ici la version a comparer.
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {emailB.length.toLocaleString("fr-FR")} caracteres
                </div>
              </div>
              {activeFocus?.target === "B" ? (
                <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  Zone ciblee: ligne {activeFocus.line}, caracteres {activeFocus.start + 1} a {activeFocus.end}
                </div>
              ) : null}
              <div className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950 shadow-inner">
                {renderTextareaHighlightOverlay(
                  emailB,
                  activeFocus?.target === "B" ? activeFocus : null,
                  mirrorBRef,
                  highlightBRef,
                )}
                <textarea
                  ref={textareaBRef}
                  placeholder="Colle ici le second email HTML"
                  value={emailB}
                  onChange={(e) => {
                    if (activeFocus?.target === "B") {
                      setActiveFocus(null);
                    }
                    setEmailB(e.target.value);
                    syncMirrorScroll("B", e.target.scrollTop, e.target.scrollLeft);
                  }}
                  onScroll={(e) => {
                    if (activeFocus?.target === "B") {
                      syncMirrorScroll("B", e.target.scrollTop, e.target.scrollLeft);
                    }
                  }}
                  spellCheck={false}
                  wrap="off"
                  rows={18}
                  className={`relative z-10 min-h-[26rem] w-full resize-y rounded-[1.5rem] bg-transparent px-4 py-4 font-mono text-sm leading-6 caret-slate-100 outline-none transition placeholder:text-slate-500 focus:ring-4 focus:ring-blue-100 ${
                    activeFocus?.target === "B" ? "text-transparent" : "text-slate-100"
                  }`}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Filtres et rapport
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Filtre les erreurs par categorie et exporte le controle courant.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => exportReport("txt")}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-950"
              >
                Export TXT
              </button>
              <button
                type="button"
                onClick={() => exportReport("json")}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Export JSON
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {issueFilterOptions.map((option) => {
              const isActive = activeIssueFilter === option.id;
              const isDisabled = option.id !== "all" && option.count === 0;

              return (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => setActiveIssueFilter(option.id)}
                  disabled={isDisabled}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-950 text-white shadow-sm"
                      : isDisabled
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-950"
                  }`}
                >
                  {option.label} ({option.count})
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div
            className={`rounded-[2rem] border p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] ${getIssuePanelClasses(validationA.length > 0)}`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Validation Twig
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {isDoubleView ? "Email A" : "Fichier en cours"}
                </p>
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getCountBadgeClasses(validationA.length > 0)}`}
              >
                {getIssueCountLabel(filteredValidationA.length, validationA.length)}
              </div>
            </div>
            <div className="space-y-3">
              {renderIssueList(filteredValidationA, {
                emptyMessage:
                  validationA.length > 0
                    ? "Aucune erreur Twig pour ce filtre."
                    : "Aucune erreur Twig detectee.",
                onSelectLine: (issue) => focusIssue("A", issue),
              })}
            </div>
          </div>

          <div
            className={`rounded-[2rem] border p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] ${getIssuePanelClasses(
              isDoubleView ? validationB.length > 0 : htmlValidationA.length > 0,
              isDoubleView ? "rose" : "amber",
            )}`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {isDoubleView ? "Validation Twig" : "Validation HTML"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {isDoubleView ? "Email B" : "Controle XHTML email"}
                </p>
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isDoubleView
                    ? getCountBadgeClasses(validationB.length > 0)
                    : getCountBadgeClasses(htmlValidationA.length > 0, "amber")
                }`}
              >
                {isDoubleView
                  ? getIssueCountLabel(filteredValidationB.length, validationB.length)
                  : getIssueCountLabel(
                      filteredHtmlValidationA.length,
                      htmlValidationA.length,
                    )}
              </div>
            </div>
            <div className="space-y-3">
              {isDoubleView
                ? renderIssueList(filteredValidationB, {
                    emptyMessage:
                      validationB.length > 0
                        ? "Aucune erreur Twig pour ce filtre."
                        : "Aucune erreur Twig detectee.",
                    onSelectLine: (issue) => focusIssue("B", issue),
                  })
                : renderIssueList(filteredHtmlValidationA, {
                    emptyMessage:
                      htmlValidationA.length > 0
                        ? "Aucune erreur HTML pour ce filtre."
                        : "Aucune erreur HTML detectee.",
                    onSelectLine: (issue) => focusIssue("A", issue),
                  })}
            </div>
          </div>
        </section>

        {isDoubleView ? (
          <section className="grid gap-6 xl:grid-cols-2">
            <div
              className={`rounded-[2rem] border p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] ${getIssuePanelClasses(htmlValidationA.length > 0, "amber")}`}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Validation HTML
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">Email A</p>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getCountBadgeClasses(htmlValidationA.length > 0, "amber")}`}
                >
                  {getIssueCountLabel(
                    filteredHtmlValidationA.length,
                    htmlValidationA.length,
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {renderIssueList(filteredHtmlValidationA, {
                  emptyMessage:
                    htmlValidationA.length > 0
                      ? "Aucune erreur HTML pour ce filtre."
                      : "Aucune erreur HTML detectee.",
                  onSelectLine: (issue) => focusIssue("A", issue),
                })}
              </div>
            </div>

            <div
              className={`rounded-[2rem] border p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] ${getIssuePanelClasses(htmlValidationB.length > 0, "amber")}`}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Validation HTML
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">Email B</p>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getCountBadgeClasses(htmlValidationB.length > 0, "amber")}`}
                >
                  {getIssueCountLabel(
                    filteredHtmlValidationB.length,
                    htmlValidationB.length,
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {renderIssueList(filteredHtmlValidationB, {
                  emptyMessage:
                    htmlValidationB.length > 0
                      ? "Aucune erreur HTML pour ce filtre."
                      : "Aucune erreur HTML detectee.",
                  onSelectLine: (issue) => focusIssue("B", issue),
                })}
              </div>
            </div>
          </section>
        ) : null}
        <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Variables Twig
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Vue detaillee des variables detectees.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {varKeys.length} variable(s)
            </div>
          </div>
          <div className="overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white">
            <table className="min-w-full border-collapse">
              <thead className="bg-slate-950 text-left text-sm text-slate-50">
                <tr>
                  <th className="px-4 py-3 font-medium">Variable</th>
                  <th className="px-4 py-3 font-medium">
                    {isDoubleView ? "Email A" : "Email"}
                  </th>
                  {isDoubleView ? (
                    <th className="px-4 py-3 font-medium">Email B</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {renderRows(varKeys, varsA, isDoubleView ? varsB : {}, {
                  mode: isDoubleView ? "double" : "single",
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Conditions Twig
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Controle des expressions et equilibre if / endif.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${conditionBalanceA.isBalanced ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"}`}
              >
              <div className="font-semibold">
                  {isDoubleView ? "Equilibre A" : "Equilibre"}
                </div>
                <div className="mt-1">
                  {conditionBalanceA.ifTotal} if / {conditionBalanceA.endifTotal} endif
                </div>
                <div className="mt-1">
                  {conditionBalanceA.forTotal} for / {conditionBalanceA.endforTotal} endfor
                </div>
              </div>
              {isDoubleView ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${conditionBalanceB.isBalanced ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"}`}
                >
                  <div className="font-semibold">Equilibre B</div>
                  <div className="mt-1">
                    {conditionBalanceB.ifTotal} if / {conditionBalanceB.endifTotal} endif
                  </div>
                  <div className="mt-1">
                    {conditionBalanceB.forTotal} for / {conditionBalanceB.endforTotal} endfor
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white">
            <table className="min-w-full border-collapse">
              <thead className="bg-slate-950 text-left text-sm text-slate-50">
                <tr>
                  <th className="px-4 py-3 font-medium">Condition</th>
                  <th className="px-4 py-3 font-medium">
                    {isDoubleView ? "Email A" : "Email"}
                  </th>
                  {isDoubleView ? (
                    <th className="px-4 py-3 font-medium">Email B</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Totaux</th>
                </tr>
              </thead>
              <tbody>
                {renderRows(condKeys, condA, isDoubleView ? condB : {}, {
                  showTotals: true,
                  mode: isDoubleView ? "double" : "single",
                  balanceA: conditionBalanceA,
                  balanceB: conditionBalanceB,
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

import { useDeferredValue, useState } from "react";
import { HtmlValidate } from "html-validate/browser";
import html5Elements from "html-validate/elements/html5";
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
const HTML_VALIDATOR = new HtmlValidate({
  rules: {
    "prefer-tbody": "off",
  },
});
const HTML_GLOBAL_ATTRIBUTES = new Set(
  Object.keys(html5Elements["*"]?.attributes || {}),
);
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
    const line = getLineNumber(html, match.index);
    const parts = raw.split(/\s+/).filter(Boolean);
    const keyword = parts[0];
    const restTokens = parts.slice(1);
    const rest = restTokens.join(" ");

    if (!TWIG_CONTROL_KEYWORDS.has(keyword)) {
      continue;
    }

    const unexpectedKeyword = findUnexpectedTwigKeyword(restTokens);

    if (unexpectedKeyword) {
      errors.push({
        line,
        tag: raw,
        message: `Balise invalide: "${unexpectedKeyword}" doit etre dans sa propre balise Twig.`,
      });
      continue;
    }

    if (keyword === "if" || keyword === "for") {
      if (!rest) {
        errors.push({
          line,
          tag: raw,
          message: `La balise "{% ${keyword} %}" doit contenir une condition ou une expression.`,
        });
        continue;
      }

      stack.push({
        keyword,
        line,
        hasElse: false,
      });
      continue;
    }

    if (keyword === "elseif") {
      const currentBlock = stack[stack.length - 1];

      if (!rest) {
        errors.push({
          line,
          tag: raw,
          message: `La balise "{% elseif %}" doit contenir une condition.`,
        });
        continue;
      }

      if (!currentBlock || currentBlock.keyword !== "if") {
        errors.push({
          line,
          tag: raw,
          message: `"{% elseif %}" doit etre place a l'interieur d'un bloc "{% if %}".`,
        });
        continue;
      }

      if (currentBlock.hasElse) {
        errors.push({
          line,
          tag: raw,
          message: `"{% elseif %}" ne peut pas apparaitre apres un "{% else %}".`,
        });
      }
      continue;
    }

    if (keyword === "else") {
      const currentBlock = stack[stack.length - 1];

      if (rest) {
        errors.push({
          line,
          tag: raw,
          message: `La balise "{% else %}" ne doit pas contenir d'expression.`,
        });
        continue;
      }

      if (!currentBlock || !["if", "for"].includes(currentBlock.keyword)) {
        errors.push({
          line,
          tag: raw,
          message: `"{% else %}" doit etre rattache a un bloc "{% if %}" ou "{% for %}".`,
        });
        continue;
      }

      if (currentBlock.hasElse) {
        errors.push({
          line,
          tag: raw,
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
          line,
          tag: raw,
          message: `La balise "{% ${keyword} %}" ne doit pas contenir d'expression.`,
        });
        continue;
      }

      if (!currentBlock || currentBlock.keyword !== expectedOpeningTag) {
        errors.push({
          line,
          tag: raw,
          message: `"{% ${keyword} %}" ne correspond a aucune ouverture "{% ${expectedOpeningTag} %}".`,
        });
        continue;
      }

      stack.pop();
    }
  }

  stack.forEach((block) => {
    errors.push({
      line: block.line,
      tag: block.keyword,
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

function validateDoctype(html) {
  const match = html.match(/<!DOCTYPE[\s\S]*?>/i);

  if (!match) {
    return [];
  }

  if (XHTML_TRANSITIONAL_DOCTYPE_REGEX.test(match[0])) {
    return [];
  }

  return [
    {
      line: getLineNumber(html, match.index || 0),
      snippet: match[0],
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
    result.messages.map((message) => ({
      line: message.line || 1,
      snippet: getLineText(html, message.line || 1),
      message: message.message,
    })),
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

    if (
      !isKnownHtmlElement(tagName) &&
      !(useXhtmlTransitionalProfile && isCustomOrNamespacedTag(tagName))
    ) {
      issues.push({
        line,
        snippet: fullTag,
        message: `La balise "<${tagName}>" n'existe pas dans le profil HTML/XHTML attendu.`,
      });
      continue;
    }

    parsedAttributes.forEach(({ name, value }) => {
      if (isDynamicAttributeName(name)) {
        return;
      }

      if (useXhtmlTransitionalProfile && isNamespacedAttribute(name)) {
        return;
      }

      if (!isAllowedHtmlAttribute(tagName, name, useXhtmlTransitionalProfile)) {
        issues.push({
          line,
          snippet: fullTag,
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
        issues.push({
          line,
          snippet: fullTag,
          message: `L'attribut "${name}" de la balise "<${tagName}>" a une valeur invalide. ${valueError}`,
        });
      }
    });

    duplicates.forEach((duplicate) => {
      issues.push({
        line,
        snippet: fullTag,
        message: `L'attribut "${duplicate.name}" est defini plusieurs fois sur la meme balise.`,
      });
    });

    if (tagName === "img") {
      const src = normalizeUrlValue(attributes.src || "");

      if (!src) {
        issues.push({
          line,
          snippet: fullTag,
          message: `L'image doit avoir un attribut "src".`,
        });
      } else if (!isDynamicTwigValue(src) && !ABSOLUTE_IMAGE_SRC_REGEX.test(src)) {
        issues.push({
          line,
          snippet: fullTag,
          message: `Le "src" de l'image doit etre absolu, pas relatif.`,
        });
      }

      if (!Object.prototype.hasOwnProperty.call(attributes, "alt")) {
        issues.push({
          line,
          snippet: fullTag,
          message: `L'image doit avoir un attribut "alt".`,
        });
      }
    }

    if (tagName === "a") {
      const href = normalizeUrlValue(attributes.href || "");

      if (!Object.prototype.hasOwnProperty.call(attributes, "href")) {
        issues.push({
          line,
          snippet: fullTag,
          message: `Le lien "<a>" doit avoir un attribut "href".`,
        });
      } else if (!href || href === "#") {
        issues.push({
          line,
          snippet: fullTag,
          message: `Le lien "<a>" ne doit pas etre vide.`,
        });
      } else if (
        !isDynamicTwigValue(href) &&
        !SPECIAL_LINK_PROTOCOLS.some((protocol) =>
          href.toLowerCase().startsWith(protocol),
        ) &&
        !HTTPS_LINK_REGEX.test(href)
      ) {
        issues.push({
          line,
          snippet: fullTag,
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

      issues.push({
        line: getLineNumber(html, index),
        snippet: word || html[index],
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

function renderValidationIssues(issues) {
  if (!issues.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Aucune erreur Twig detectee.
      </div>
    );
  }

  return issues.map((issue, index) => (
    <div
      key={`${issue.line}-${issue.tag}-${index}`}
      className="rounded-2xl border border-rose-200 bg-white/85 px-4 py-3 shadow-sm"
    >
      <div className="text-sm font-semibold text-slate-900">
        Ligne {issue.line}
      </div>
      <div className="mt-1 text-sm text-slate-700">{issue.message}</div>
      <div className="mt-2 rounded-xl bg-slate-950 px-3 py-2 text-xs text-slate-100">
        {`{% ${issue.tag} %}`}
      </div>
    </div>
  ));
}

function renderHtmlIssueList(issues) {
  if (!issues.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Aucune erreur HTML detectee.
      </div>
    );
  }

  return issues.map((issue, index) => (
    <div
      key={`${issue.line}-${issue.snippet}-${index}`}
      className="rounded-2xl border border-amber-200 bg-white/85 px-4 py-3 shadow-sm"
    >
      <div className="text-sm font-semibold text-slate-900">
        Ligne {issue.line}
      </div>
      <div className="mt-1 text-sm text-slate-700">{issue.message}</div>
      <div className="mt-2 rounded-xl bg-slate-950 px-3 py-2 text-xs text-slate-100">
        {issue.snippet}
      </div>
    </div>
  ));
}

export default function App() {
  const [emailA, setEmailA] = useState("");
  const [emailB, setEmailB] = useState("");
  const [viewMode, setViewMode] = useState("single");
  const isDoubleView = viewMode === "double";
  const deferredEmailA = useDeferredValue(emailA);
  const deferredEmailB = useDeferredValue(emailB);

  const varsA = countTwigVariables(deferredEmailA);
  const varsB = countTwigVariables(deferredEmailB);

  const condA = countTwigConditions(deferredEmailA);
  const condB = countTwigConditions(deferredEmailB);
  const validationA = validateTwigControlStructures(deferredEmailA);
  const validationB = validateTwigControlStructures(deferredEmailB);
  const htmlValidationA = [
    ...validateHtmlRules(deferredEmailA),
    ...validateEncodedSpecialCharacters(deferredEmailA),
  ];
  const htmlValidationB = [
    ...validateHtmlRules(deferredEmailB),
    ...validateEncodedSpecialCharacters(deferredEmailB),
  ];

  const varKeys = isDoubleView
    ? Array.from(new Set([...Object.keys(varsA), ...Object.keys(varsB)]))
    : Object.keys(varsA);

  const condKeys = isDoubleView
    ? Array.from(new Set([...Object.keys(condA), ...Object.keys(condB)]))
    : Object.keys(condA);
  const conditionBalanceA = getConditionBalance(condA);
  const conditionBalanceB = getConditionBalance(condB);
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
      ];

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

          <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-4 lg:px-8">
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
          <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur">
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
                {deferredEmailA.length.toLocaleString("fr-FR")} caracteres
              </div>
            </div>
            <textarea
              placeholder="Colle ici ton email HTML"
              value={emailA}
              onChange={(e) => setEmailA(e.target.value)}
              rows={18}
              className="min-h-[26rem] w-full rounded-[1.5rem] border border-slate-200 bg-slate-950 px-4 py-4 text-sm leading-6 text-slate-100 shadow-inner outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {isDoubleView ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur">
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
                  {deferredEmailB.length.toLocaleString("fr-FR")} caracteres
                </div>
              </div>
              <textarea
                placeholder="Colle ici le second email HTML"
                value={emailB}
                onChange={(e) => setEmailB(e.target.value)}
                rows={18}
                className="min-h-[26rem] w-full rounded-[1.5rem] border border-slate-200 bg-slate-950 px-4 py-4 text-sm leading-6 text-slate-100 shadow-inner outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          ) : null}
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
                {validationA.length} erreur(s)
              </div>
            </div>
            <div className="space-y-3">{renderValidationIssues(validationA)}</div>
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
                {isDoubleView ? validationB.length : htmlValidationA.length} erreur(s)
              </div>
            </div>
            <div className="space-y-3">
              {isDoubleView
                ? renderValidationIssues(validationB)
                : renderHtmlIssueList(htmlValidationA)}
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
                  {htmlValidationA.length} erreur(s)
                </div>
              </div>
              <div className="space-y-3">{renderHtmlIssueList(htmlValidationA)}</div>
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
                  {htmlValidationB.length} erreur(s)
                </div>
              </div>
              <div className="space-y-3">{renderHtmlIssueList(htmlValidationB)}</div>
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

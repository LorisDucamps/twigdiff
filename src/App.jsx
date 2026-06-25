import { useState } from "react";

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

function sumRawCounts(entry) {
  if (!entry) {
    return 0;
  }

  return Object.values(entry.raws).reduce((total, count) => total + count, 0);
}

function renderRows(keys, dataA, dataB, options = {}) {
  const { showTotals = false } = options;

  return keys.map((key) => {
    const a = dataA[key];
    const b = dataB[key];

    const isDifferent =
      !a || !b || JSON.stringify(a.raws) !== JSON.stringify(b.raws);

    return (
      <tr
        key={key}
        style={{
          background: isDifferent ? "#ffe5e5" : "#e5ffe5",
          verticalAlign: "top",
        }}
      >
        <td>
          <strong>{key}</strong>
        </td>

        <td>
          {a
            ? Object.entries(a.raws).map(([expr, count]) => (
                <div key={expr}>
                  {expr} × {count}
                </div>
              ))
            : "—"}
        </td>

        <td>
          {b
            ? Object.entries(b.raws).map(([expr, count]) => (
                <div key={expr}>
                  {expr} × {count}
                </div>
              ))
            : "—"}
        </td>

        {showTotals ? (
          <td>
            {key === "if" ? (
              <>
                <div>If total A: {sumRawCounts(a)}</div>
                <div>If total B: {sumRawCounts(b)}</div>
              </>
            ) : null}

            {key === "endif" ? (
              <>
                <div>Endif total A: {sumRawCounts(a)}</div>
                <div>Endif total B: {sumRawCounts(b)}</div>
              </>
            ) : null}

            {key !== "if" && key !== "endif" ? "—" : null}
          </td>
        ) : null}
      </tr>
    );
  });
}

export default function App() {
  const [emailA, setEmailA] = useState("");
  const [emailB, setEmailB] = useState("");

  const varsA = countTwigVariables(emailA);
  const varsB = countTwigVariables(emailB);

  const condA = countTwigConditions(emailA);
  const condB = countTwigConditions(emailB);

  const varKeys = Array.from(
    new Set([...Object.keys(varsA), ...Object.keys(varsB)]),
  );

  const condKeys = Array.from(
    new Set([...Object.keys(condA), ...Object.keys(condB)]),
  );

  return (
    <div style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>🔍 Twig Diff Viewer</h1>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ width: "100%" }}>
          <h2>Email actuellement en PROD</h2>
          <textarea
            placeholder="Email HTML A"
            value={emailA}
            onChange={(e) => setEmailA(e.target.value)}
            rows={15}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ width: "100%" }}>
          <h2>Email sortie de PULSE</h2>
          <textarea
            placeholder="Email HTML B"
            value={emailB}
            onChange={(e) => setEmailB(e.target.value)}
            rows={15}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* VARIABLES */}
      <h2>Variables Twig</h2>
      <table border="1" cellPadding="8" width="100%">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Email A</th>
            <th>Email B</th>
          </tr>
        </thead>
        <tbody>{renderRows(varKeys, varsA, varsB)}</tbody>
      </table>

      {/* CONDITIONS */}
      <h2 style={{ marginTop: 32 }}>Conditions Twig</h2>
      <table border="1" cellPadding="8" width="100%">
        <thead>
          <tr>
            <th>Condition</th>
            <th>Email A</th>
            <th>Email B</th>
            <th>Totaux</th>
          </tr>
        </thead>
        <tbody>{renderRows(condKeys, condA, condB, { showTotals: true })}</tbody>
      </table>
    </div>
  );
}

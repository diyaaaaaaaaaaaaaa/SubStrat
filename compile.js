const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = __dirname;
const CONTRACTS = path.join(ROOT, "contracts");
const OUT = path.join(ROOT, "build");

function findImports(importPath) {
  const candidates = [
    path.join(CONTRACTS, importPath),
    path.join(ROOT, "node_modules", importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { contents: fs.readFileSync(c, "utf8") };
    }
  }
  return { error: `File not found: ${importPath}` };
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".sol")) files.push(full);
  }
  return files;
}

const solFiles = walk(CONTRACTS);
const sources = {};
for (const f of solFiles) {
  const rel = path.relative(CONTRACTS, f);
  sources[rel] = { content: fs.readFileSync(f, "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

// solc's import resolution needs paths relative to CONTRACTS for local files,
// but our sources map uses relative-to-CONTRACTS keys too, so re-map findImports
// to check relative to each source's own directory as well as node_modules/CONTRACTS root.
function findImportsRelative(importPath) {
  const tryPaths = [
    path.join(CONTRACTS, importPath),
    path.join(ROOT, "node_modules", importPath),
  ];
  for (const p of tryPaths) {
    if (fs.existsSync(p)) return { contents: fs.readFileSync(p, "utf8") };
  }
  return { error: `File not found: ${importPath}` };
}

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImportsRelative })
);

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      hasError = true;
      console.error(err.formattedMessage);
    } else {
      console.warn(err.formattedMessage);
    }
  }
}
if (hasError) {
  process.exit(1);
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
for (const fileName of Object.keys(output.contracts)) {
  for (const contractName of Object.keys(output.contracts[fileName])) {
    const artifact = output.contracts[fileName][contractName];
    fs.writeFileSync(
      path.join(OUT, `${contractName}.json`),
      JSON.stringify(
        { abi: artifact.abi, bytecode: "0x" + artifact.evm.bytecode.object },
        null,
        2
      )
    );
  }
}
console.log("Compiled OK. Artifacts written to build/");

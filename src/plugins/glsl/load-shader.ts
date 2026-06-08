import { readFileSync } from "fs";
import { platform } from "os";
import { dirname, extname, posix, resolve, sep } from "path";
import { cwd, emitWarning } from "process";

import type { LoadingOptions, LoadingOutput } from "./types";

let recursiveChunk = "";
const allChunks = new Set<string>();
const dependentChunks = new Map<string, string[]>();
const duplicatedChunks = new Map<string, string[]>();

function resetSavedChunks(): string {
  const chunk = recursiveChunk;
  duplicatedChunks.clear();
  dependentChunks.clear();
  recursiveChunk = "";
  allChunks.clear();
  return chunk;
}

function getRecursionCaller(): string {
  const dependencies = [...dependentChunks.keys()];
  return dependencies[dependencies.length - 1];
}

function checkDuplicatedImports(path: string): void {
  const caller = getRecursionCaller();
  const chunks = duplicatedChunks.get(caller) ?? [];

  if (chunks.includes(path)) {
    return;
  }

  chunks.push(path);
  duplicatedChunks.set(caller, chunks);

  emitWarning(`'${path}' was included multiple times.`, {
    code: "vite-plugin-glsl",
    detail:
      "Please avoid multiple imports of the same chunk in order to avoid" +
      ` recursions and optimize your shader length.\nDuplicated import found in file '${caller}'.`
  });
}

function removeSourceComments(source: string, pattern: RegExp, triple = false): string {
  if (source.includes("/*") && source.includes("*/")) {
    source = source.slice(0, source.indexOf("/*")) + source.slice(source.indexOf("*/") + 2, source.length);
  }

  const lines = source.split("\n");

  for (let l = lines.length; l--; ) {
    const index = lines[l].indexOf("//");

    if (index > -1) {
      if (lines[l][index + 2] === "/" && !pattern.test(lines[l]) && !triple) {
        continue;
      }
      lines[l] = lines[l].slice(0, index);
    }
  }

  return lines.join("\n");
}

function checkIncludedDependencies(path: string, root: string): boolean {
  const dependencies = dependentChunks.get(path);
  let recursiveDependency = false;

  if (dependencies?.includes(root)) {
    recursiveChunk = root;
    return true;
  }

  dependencies?.forEach((dependency) => {
    recursiveDependency ||= checkIncludedDependencies(dependency, root);
  });

  return recursiveDependency;
}

function checkRecursiveImports(path: string, lowPath: string, warn: boolean, ignore: boolean): boolean | null {
  if (allChunks.has(lowPath)) {
    if (ignore) {
      return null;
    }
    if (warn) {
      checkDuplicatedImports(path);
    }
  }

  return checkIncludedDependencies(path, path);
}

export function minifyShader(shader: string, newLine = false): string {
  const getAllCharIndexes = (line: string, char = "-", start = 0): number[] => {
    const indexes: number[] = [];

    while ((start = line.indexOf(char, start)) !== -1) {
      indexes.push(start++);
    }

    return indexes;
  };

  return shader
    .replace(/\\(?:\r\n|\n\r|\n|\r)|\/\*.*?\*\/|\/\/(?:\\(?:\r\n|\n\r|\n|\r)|[^\n\r])*/g, "")
    .split(/\n+/)
    .reduce((result: string[], line: string) => {
      line = line.trim().replace(/\s{2,}|\t/, " ");

      if (/@(vertex|fragment|compute)/.test(line) || line.endsWith("return")) {
        line += " ";
      }

      if (line[0] === "#") {
        if (newLine) {
          result.push("\n");
        }
        result.push(line, "\n");
        newLine = false;
      } else {
        if (!line.startsWith("{") && result.length && result[result.length - 1].endsWith("else")) {
          result.push(" ");
        }
        line = line.replace(/\s*({|}|=|\*|,|\+|\/|>|<|&|\||\[|\]|\(|\)|!|;)\s*/g, "$1");
        const indexes = getAllCharIndexes(line);

        indexes.forEach((index) => {
          if (line[index - 1] === " " && line[index - 2] !== "-") {
            line = `${line.slice(0, index - 1)}${line.slice(index--)}`;
          }
          if (line[index + 1] === " " && line[index + 2] !== "-") {
            line = `${line.slice(0, index + 1)}${line.slice(index + 2)}`;
          }
        });

        result.push(line);
        newLine = true;
      }

      return result;
    }, [])
    .join("")
    .replace(/\n+/g, "\n");
}

function loadChunks(source: string, path: string, pattern: RegExp, options: LoadingOptions): string {
  const unixPath = path.split(sep).join(posix.sep);

  const chunkPath = platform() === "win32" ? unixPath.toLocaleLowerCase() : unixPath;

  const recursion = checkRecursiveImports(
    unixPath,
    chunkPath,
    options.warnDuplicatedImports,
    options.removeDuplicatedImports
  );

  if (recursion) {
    return recursiveChunk;
  } else if (recursion === null) {
    return "";
  }

  source = removeSourceComments(source, pattern);
  let directory = dirname(unixPath);
  allChunks.add(chunkPath);

  if (pattern.test(source)) {
    dependentChunks.set(unixPath, []);
    const currentDirectory = directory;
    const ext = options.defaultExtension;

    source = source.replace(pattern, (_match: string, ..._args: unknown[]) => {
      let chunkImportPath = (_args[1] as string).trim().replace(/^(?:"|')?|(?:"|')?;?$/gi, "");

      if (!chunkImportPath.indexOf("/")) {
        const base = cwd().split(sep).join(posix.sep);
        chunkImportPath = base + options.root + chunkImportPath;
      }

      const directoryIndex = chunkImportPath.lastIndexOf("/");
      directory = currentDirectory;

      if (directoryIndex !== -1) {
        directory = resolve(directory, chunkImportPath.slice(0, directoryIndex + 1));
        chunkImportPath = chunkImportPath.slice(directoryIndex + 1, chunkImportPath.length);
      }

      let shader = resolve(directory, chunkImportPath);
      if (!extname(shader)) {
        shader = `${shader}.${ext}`;
      }

      const shaderPath = shader.split(sep).join(posix.sep);
      dependentChunks.get(unixPath)?.push(shaderPath);

      return loadChunks(readFileSync(shader, "utf8"), shader, pattern, options);
    });
  }

  if (recursiveChunk) {
    const caller = getRecursionCaller();
    const chunk = resetSavedChunks();

    throw new Error(`Recursion detected when importing "${chunk}" in "${caller}".`);
  }

  return source.trim().replace(/(\r\n|\r|\n){3,}/g, "$1\n");
}

export default async function loadShader(
  source: string,
  shader: string,
  options: LoadingOptions
): Promise<LoadingOutput> {
  const pattern = new RegExp(String.raw`(${options.importKeywords.join("|")})(\s+([^\s<>]+));?`, "gi");

  resetSavedChunks();

  let outputShader = loadChunks(source, shader, pattern, options);

  if (options.minify) {
    outputShader = minifyShader(removeSourceComments(outputShader, pattern, true));
  }

  outputShader = (await options.onComplete?.(outputShader, shader)) ?? outputShader;

  return { dependentChunks, outputShader };
}

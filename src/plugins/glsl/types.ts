export type OnComplete = ((shader: string, path: string) => Promise<string> | string) | undefined;

export type GlobPattern = string | string[];

export interface LoadingOptions {
  warnDuplicatedImports: boolean;
  removeDuplicatedImports: boolean;
  defaultExtension: string;
  importKeywords: string[];
  onComplete: OnComplete;
  minify: boolean;
  root: string;
}

export type PluginOptions = Partial<LoadingOptions> & {
  include?: GlobPattern;
  exclude?: GlobPattern;
  watch?: boolean;
};

export interface LoadingOutput {
  dependentChunks: Map<string, string[]>;
  outputShader: string;
}

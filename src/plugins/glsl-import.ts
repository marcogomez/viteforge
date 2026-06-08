import glsl from "./glsl/index";

import type { PluginOption } from "vite";

async function getGLSLPlugin(): Promise<PluginOption> {
  return glsl({
    include: ["**/*.glsl", "**/*.wgsl", "**/*.vert", "**/*.frag", "**/*.vs", "**/*.fs"]
  }) as PluginOption;
}

export { getGLSLPlugin };

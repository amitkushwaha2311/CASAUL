declare module "liquid-gl" {
  export interface LiquidGLOptions {
    engine?: "auto" | "webgpu" | "webgl2" | "webgl";
    snapshot?: string;
    target?: string;
    resolution?: number;
    zIndex?: number;
    content?: string;
    refraction?: number;
    aberration?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    shadow?: boolean;
    specular?: boolean;
    reveal?: "fade" | "none";
    tilt?: boolean;
    tiltFactor?: number;
    tiltEase?: number;
    helper?: boolean;
  }

  export interface LiquidGLLens {
    destroy(): void;
    setTint(color: string): void;
    setDraggable(draggable: boolean): void;
  }

  function liquidGL(options: LiquidGLOptions): LiquidGLLens | LiquidGLLens[];

  export default liquidGL;
}

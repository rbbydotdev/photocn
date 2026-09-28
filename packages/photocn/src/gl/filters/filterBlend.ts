import { Shader, Texture } from '../minigl.js'

type ShaderHandle = {
    drawRect: (...args: any[]) => void
    uniforms: (uniforms?: Uniforms) => void
}

type TextureSource = TexImageSource & {
    width: number
    height: number
}

type TextureHandle = {
    loadImage: (img: TextureSource, format?: number) => void
    use: (unit?: number) => void
}

type ShaderConstructor = new (
    gl: WebGL2RenderingContext,
    vertexSrc?: string | null,
    fragmentSrc?: string | null,
) => ShaderHandle

type TextureConstructor = new (
    gl: WebGL2RenderingContext,
    width?: number,
    height?: number,
) => TextureHandle

type UniformValue = number | { unit: number }
type Uniforms = Record<string, UniformValue>

type FilterCache = {
    $blend?: ShaderHandle
    $blendtxt?: TextureHandle
}

type MiniGLFilterHost = {
    gl: WebGL2RenderingContext
    _: FilterCache
    runFilter: (shader: ShaderHandle, uniforms?: Uniforms | null) => void
}

const ShaderCtor = Shader as unknown as ShaderConstructor
const TextureCtor = Texture as unknown as TextureConstructor

export function filterBlend(mini: MiniGLFilterHost, blendmap: TextureSource, blendmix?: number | null) {
    const {gl} = mini

    const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D map;
        uniform float filterStrength;

        vec4 fromLinear(vec4 linearRGB) {
            bvec3 cutoff = lessThan(linearRGB.rgb, vec3(0.0031308));
            vec3 higher = vec3(1.055)*pow(linearRGB.rgb, vec3(1.0/2.4)) - vec3(0.055);
            vec3 lower = linearRGB.rgb * vec3(12.92);
            return vec4(mix(higher, lower, cutoff), linearRGB.a);
        }
        vec4 toLinear(vec4 sRGB) {
            bvec3 cutoff = lessThan(sRGB.rgb, vec3(0.04045));
            vec3 higher = pow((sRGB.rgb + vec3(0.055))/vec3(1.055), vec3(2.4));
            vec3 lower = sRGB.rgb/vec3(12.92);
            return vec4(mix(higher, lower, cutoff), sRGB.a);
        }

        void main(){
          vec4 color = texture(_texture, texCoord);
          vec4 texc = texture(map, texCoord);
          color = toLinear(color);
          texc = toLinear(texc);
          color = mix(color, texc, filterStrength);
          color = fromLinear(color);
          outColor = color;
        }`

    mini._.$blend = mini._.$blend || new ShaderCtor(gl, null, _fragment);
    mini._.$blendtxt = mini._.$blendtxt || new TextureCtor(gl);
    mini._.$blendtxt.loadImage(blendmap)
    mini._.$blendtxt.use(1);
    mini.runFilter(mini._.$blend, { filterStrength: blendmix??1, map:{unit:1} });

}

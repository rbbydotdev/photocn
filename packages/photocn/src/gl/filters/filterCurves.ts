// @ts-nocheck — soft-fork upstream, was strict:false in xphoto
// Derived from mini-photo-editor (https://github.com/xdadda/mini-photo-editor),
// MIT © 2025 xdadda. See THIRD_PARTY_NOTICES.md.
import { Shader, Texture } from '../minigl.js'
import { Spline, type SplinePoint } from './cubicspline.js'

type ShaderHandle = {
    drawRect: (...args: any[]) => void
    uniforms: (uniforms?: Uniforms) => void
}

type TextureHandle = {
    initFromBytes: (width: number, height: number, data: number[], format?: number) => void
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

type UniformValue = { unit: number }
type Uniforms = Record<string, UniformValue>

type FilterCache = {
    $curves?: ShaderHandle
    $curvestexture?: TextureHandle
}

type MiniGLFilterHost = {
    gl: WebGL2RenderingContext
    _: FilterCache
    runFilter: (shader: ShaderHandle, uniforms?: Uniforms | null) => void
}

type CurveChannels = Array<SplinePoint[] | null | undefined>

const ShaderCtor = Shader as unknown as ShaderConstructor
const TextureCtor = Texture as unknown as TextureConstructor
const SplineCtor = Spline as unknown as new (points: SplinePoint[]) => Spline

    function splineInterpolate(points: SplinePoint[]): number[] {
        var spline = new SplineCtor(points);
        var curve = [];
        for (var i = 0; i < 256; i++) {
            curve.push(clamp(0, Math.floor(spline.at(i / 255) * 256), 255));
        }
        return curve;
    }

    function clamp(lo: number, value: number, hi: number): number {
        return Math.max(lo, Math.min(value, hi));
    }

/**
 * 256-entry lookup tables for [rgb, red, green, blue] curves (each a list of
 * [input, output] points in 0..1, or null for identity). A channel curve is
 * applied first, then the RGB curve on top, like Photoshop / Lightroom.
 */
export function curveLookupTables(array: CurveChannels): [number[], number[], number[]] {
    const identity = Array.from({ length: 256 }, (_, i) => i)
    const master = array[0] ? splineInterpolate(array[0] as SplinePoint[]) : identity
    const channel = (points?: SplinePoint[] | null) => {
        const own = points ? splineInterpolate(points) : identity
        return own.map((value) => master[value])
    }
    return [channel(array[1]), channel(array[2]), channel(array[3])]
}

//red,green,blue   arrays [[0,0],...,[1,1]] describing channel curve
export function filterCurves(mini: MiniGLFilterHost, array: CurveChannels) {
  //console.log('filterCurves')
    if(array.every(e=>!e)) return //console.error('curves: need at least one array')
    const [red, green, blue] = curveLookupTables(array)
    if(red.length!==256 || green.length!==256 || blue.length!==256) return console.error('curves: input unknown')

    var curveMap = [];
    for (var i = 0; i < 256; i++) {
        curveMap.splice(curveMap.length, 0, red[i], green[i], blue[i], 255);
    }    

    const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D curvemap;

        void main() {
            vec4 color = texture(_texture, texCoord);
            color.r = texture(curvemap, vec2(color.r)).r;
            color.g = texture(curvemap, vec2(color.g)).g;
            color.b = texture(curvemap, vec2(color.b)).b;
            outColor = color;
        }
      `

    const {gl}=mini
    //setup and run effect
    mini._.$curvestexture = mini._.$curvestexture || new TextureCtor(gl);
    mini._.$curvestexture.initFromBytes(256, 1, curveMap, gl.RGBA); //otherwise artifacts will be introduced
    mini._.$curvestexture.use(2);
    mini._.$curves = mini._.$curves || new ShaderCtor(gl, null, _fragment);
    mini.runFilter(mini._.$curves, {curvemap:{unit:2}} )
}

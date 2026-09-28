import { Shader } from '../minigl.js'

type Matrix3 = [number, number, number, number, number, number, number, number, number]
type MatrixInput = number[] | number[][]
type QuadCoords = [number, number, number, number, number, number, number, number]

type ShaderHandle = {
    drawRect: (...args: any[]) => void
    uniforms: (uniforms?: Uniforms) => void
}

type ShaderConstructor = new (
    gl: WebGL2RenderingContext,
    vertexSrc?: string | null,
    fragmentSrc?: string | null,
) => ShaderHandle

type UniformValue = number | number[] | Matrix3
type Uniforms = Record<string, UniformValue>

type FilterCache = {
    $warp?: ShaderHandle
}

type MiniGLFilterHost = {
    gl: WebGL2RenderingContext
    _: FilterCache
    runFilter: (shader: ShaderHandle, uniforms?: Uniforms | null) => void
}

const ShaderCtor = Shader as unknown as ShaderConstructor

    /**
     * @filter                Matrix Warp
     * @description           Transforms an image by a 2x2 or 3x3 matrix. The coordinates used in
     *                        the transformation are (x, y) for a 2x2 matrix or (x, y, 1) for a
     *                        3x3 matrix, where x and y are in units of pixels.
     * @param matrix          A 2x2 or 3x3 matrix represented as either a list or a list of lists.
     *                        For example, the 3x3 matrix [[2,0,0],[0,3,0],[0,0,1]] can also be
     *                        represented as [2,0,0,0,3,0,0,0,1] or just [2,0,0,3].
     * @param inverse         A boolean value that, when true, applies the inverse transformation
     *                        instead. (optional, defaults to false)
     * @param useTextureSpace A boolean value that, when true, uses texture-space coordinates
     *                        instead of screen-space coordinates. Texture-space coordinates range
     *                        from -1 to 1 instead of 0 to width - 1 or height - 1, and are easier
     *                        to use for simple operations like flipping and rotating.
     */
    function matrixWarp(mini: MiniGLFilterHost, matrix: MatrixInput, inverse?: boolean, useTextureSpace?: boolean) {

        const _fragment = `#version 300 es
            precision highp float;

            in vec2 texCoord;
            uniform sampler2D _texture;
            uniform vec2 uResolution;
            uniform mat3 matrix;
            uniform bool useTextureSpace;
            out vec4 outColor;

            void main() {
                vec2 coord = texCoord * uResolution;
                if (useTextureSpace) coord = coord / uResolution * 2.0 - 1.0;
                vec3 warp = matrix * vec3(coord, 1.0);
                coord = warp.xy / warp.z;
                if (useTextureSpace) coord = (coord * 0.5 + 0.5) * uResolution;
                vec4 color = texture(_texture, coord / uResolution);
                vec2 clampedCoord = clamp(coord, vec2(0.0), uResolution);
                if (coord != clampedCoord) {
                    //color.a *= max(0.0, 1.0 - length(coord - clampedCoord));
                    color.a = 0.;
                }
                outColor = color;
            }
          `


        const {gl}=mini
        mini._.$warp = mini._.$warp || new ShaderCtor(gl, null, _fragment);

        // Flatten all members of matrix into one big list
        let flatMatrix = Array.prototype.concat.apply([], matrix) as number[];
        // Extract a 3x3 matrix out of the arguments
        if (flatMatrix.length == 4) {
            flatMatrix = [
                flatMatrix[0], flatMatrix[1], 0,
                flatMatrix[2], flatMatrix[3], 0,
                0, 0, 1
            ];
        } else if (flatMatrix.length != 9) {
            throw 'can only warp with 2x2 or 3x3 matrix';
        }
    
        const uResolution = [gl.canvas.width,gl.canvas.height];
        mini.runFilter(mini._.$warp, { 
          matrix: inverse ? getInverse(flatMatrix as Matrix3) : flatMatrix,
          uResolution,
          useTextureSpace: (useTextureSpace as any) | 0
        });
    }


export function filterPerspective(mini: MiniGLFilterHost, before: MatrixInput, after: MatrixInput, inverse?: boolean, useTextureSpace?: boolean ) {

  const beforeFlat = before.flat() as number[]
  const afterFlat = after.flat() as number[]
  var a = getSquareToQuad(...(afterFlat as QuadCoords));
  var b = getSquareToQuad(...(beforeFlat as QuadCoords));
  var c = multiply(getInverse(a), b);
  return matrixWarp(mini, c, inverse, useTextureSpace);
}



// from javax.media.jai.PerspectiveTransform
function getSquareToQuad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Matrix3 {
    var dx1 = x1 - x2;
    var dy1 = y1 - y2;
    var dx2 = x3 - x2;
    var dy2 = y3 - y2;
    var dx3 = x0 - x1 + x2 - x3;
    var dy3 = y0 - y1 + y2 - y3;
    var det = dx1*dy2 - dx2*dy1;
    var a = (dx3*dy2 - dx2*dy3) / det;
    var b = (dx1*dy3 - dx3*dy1) / det;
    return [
        x1 - x0 + a*x1, y1 - y0 + a*y1, a,
        x3 - x0 + b*x3, y3 - y0 + b*y3, b,
        x0, y0, 1
    ];
}

function getInverse(m: Matrix3): Matrix3 {
    var a = m[0], b = m[1], c = m[2];
    var d = m[3], e = m[4], f = m[5];
    var g = m[6], h = m[7], i = m[8];
    var det = a*e*i - a*f*h - b*d*i + b*f*g + c*d*h - c*e*g;
    return [
        (e*i - f*h) / det, (c*h - b*i) / det, (b*f - c*e) / det,
        (f*g - d*i) / det, (a*i - c*g) / det, (c*d - a*f) / det,
        (d*h - e*g) / det, (b*g - a*h) / det, (a*e - b*d) / det
    ];
}

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
    return [
        a[0]*b[0] + a[1]*b[3] + a[2]*b[6],
        a[0]*b[1] + a[1]*b[4] + a[2]*b[7],
        a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
        a[3]*b[0] + a[4]*b[3] + a[5]*b[6],
        a[3]*b[1] + a[4]*b[4] + a[5]*b[7],
        a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
        a[6]*b[0] + a[7]*b[3] + a[8]*b[6],
        a[6]*b[1] + a[7]*b[4] + a[8]*b[7],
        a[6]*b[2] + a[7]*b[5] + a[8]*b[8]
    ];
}

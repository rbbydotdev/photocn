// @ts-nocheck — soft-fork upstream, was strict:false in xphoto
// Derived from mini-photo-editor (https://github.com/xdadda/mini-photo-editor),
// MIT © 2025 xdadda. See THIRD_PARTY_NOTICES.md.
import { Shader } from '../minigl.js'

type Matrix3 = [number, number, number, number, number, number, number, number, number]

type ShaderHandle = {
  drawRect: (...args: any[]) => void
  uniforms: (uniforms?: Uniforms) => void
}

type ShaderConstructor = new (
  gl: WebGL2RenderingContext,
  vertexSrc?: string | null,
  fragmentSrc?: string | null,
) => ShaderHandle

type UniformValue = Matrix3 | { unit: number }
type Uniforms = Record<string, UniformValue>

type FilterCache = {
  $matrix?: ShaderHandle
}

type MiniGLFilterHost = {
  gl: WebGL2RenderingContext
  img: { width: number; height: number }
  height: number
  _: FilterCache
  runFilter: (shader: ShaderHandle, uniforms?: Uniforms | null) => void
}

type MatrixParams = Partial<{
  translateX: number
  translateY: number
  angle: number
  scale: number
  flipv: number
  fliph: number
}>

const ShaderCtor = Shader as unknown as ShaderConstructor

export function filterMatrix(mini: MiniGLFilterHost, params?: MatrixParams | null) {
  const {gl,img}=mini
  //console.log('filterMatrix')
  params=params||{translateX:0,translateY:0,angle:0,scale:0,flipv:0,fliph:0};
  let {translateX,translateY,angle,scale:_scale,flipv,fliph} = params
  _scale+=1 //in order to use -1/+1 range as scale input, so that 0 = 1:1 scale
  let scale=[_scale,_scale]
  //convert translateX/Y from clip space(0-1) to pixel space
  const translation = [
        Math.round(gl.canvas.width*translateX*100)/100,
        Math.round(gl.canvas.height*translateY*100)/100,
  ]

    const _vertex = `#version 300 es
        in vec2 vertex;
        uniform mat3 matrix;
        out vec2 texCoord;
        void main() {
          texCoord = vertex;
          gl_Position = vec4((matrix * vec3(vertex, 1)).xy, 0, 1);
        }
      `

    const _fragment = `#version 300 es
        precision highp float;
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;   
        void main() {
          outColor = texture(_texture, vec2(texCoord.x, texCoord.y));
        }
      ` 

  //check if canvas is rotated using mini.height, as it's updated in case of crop or resize
  if(gl.canvas.width===mini.height){ 
    const aspectratio = img.width/img.height    
    scale[0]*=aspectratio
    scale[1]/=aspectratio
  }
  // Compute the matrices
  const projectionMatrix = m3.projection(gl.canvas.width, gl.canvas.height);
  const translationMatrix = m3.translation(translation[0], translation[1]);
  const rotationMatrix = m3.rotation(-angle * Math.PI / 180);
  const scaleMatrix = m3.scaling(scale[0]*(-fliph||1), scale[1]*(-flipv||1));
  
  //center crop selection
  let matrix: Matrix3 = [1,0,0,0,1,0,0,0,1] //identity matrix
  matrix = m3.multiply(matrix, projectionMatrix);
  //matrix = m3.multiply(matrix, _scaleMatrix);
  matrix = m3.multiply(matrix, translationMatrix);
  //set pivot at the center of the image
  matrix = m3.multiply(matrix, m3.translation(gl.canvas.width/2, gl.canvas.height/2))
  matrix = m3.multiply(matrix, rotationMatrix);
  matrix = m3.multiply(matrix, scaleMatrix);
  //reset pivot
  matrix = m3.multiply(matrix, m3.translation(-gl.canvas.width/2, -gl.canvas.height/2))
  // scale our 1 unit quad from 1 unit to img width & height
  matrix = m3.multiply(matrix, m3.scaling(gl.canvas.width, gl.canvas.height))
  //setup and run effect
  mini._.$matrix = mini._.$matrix || new ShaderCtor(gl, _vertex, _fragment)
  mini.runFilter(mini._.$matrix, {matrix})
}

  const m3 = {
    projection: function projection(width: number, height: number): Matrix3 {
      // Note: This matrix flips the Y axis so that 0 is at the top.
      return [
        2 / width, 0, 0,
        0, 2 / height, 0,
        -1, -1, 1,
      ];
    },

    translation: function translation(tx: number, ty: number): Matrix3 {
      return [
        1, 0, 0,
        0, 1, 0,
        tx, ty, 1,
      ];
    },

    rotation: function rotation(angleInRadians: number): Matrix3 {
      const c = Math.cos(angleInRadians);
      const s = Math.sin(angleInRadians);
      return [
        c, -s, 0,
        s, c, 0,
        0, 0, 1,
      ];
    },

    scaling: function scaling(sx: number, sy: number): Matrix3 {
      return [
        sx, 0, 0,
        0, sy, 0,
        0, 0, 1,
      ];
    },

    multiply: function multiply(a: Matrix3, b: Matrix3): Matrix3 {
      const a00 = a[0 * 3 + 0];
      const a01 = a[0 * 3 + 1];
      const a02 = a[0 * 3 + 2];
      const a10 = a[1 * 3 + 0];
      const a11 = a[1 * 3 + 1];
      const a12 = a[1 * 3 + 2];
      const a20 = a[2 * 3 + 0];
      const a21 = a[2 * 3 + 1];
      const a22 = a[2 * 3 + 2];
      const b00 = b[0 * 3 + 0];
      const b01 = b[0 * 3 + 1];
      const b02 = b[0 * 3 + 2];
      const b10 = b[1 * 3 + 0];
      const b11 = b[1 * 3 + 1];
      const b12 = b[1 * 3 + 2];
      const b20 = b[2 * 3 + 0];
      const b21 = b[2 * 3 + 1];
      const b22 = b[2 * 3 + 2];
      return [
        b00 * a00 + b01 * a10 + b02 * a20,
        b00 * a01 + b01 * a11 + b02 * a21,
        b00 * a02 + b01 * a12 + b02 * a22,
        b10 * a00 + b11 * a10 + b12 * a20,
        b10 * a01 + b11 * a11 + b12 * a21,
        b10 * a02 + b11 * a12 + b12 * a22,
        b20 * a00 + b21 * a10 + b22 * a20,
        b20 * a01 + b21 * a11 + b22 * a21,
        b20 * a02 + b21 * a12 + b22 * a22,
      ];
    },
  };
